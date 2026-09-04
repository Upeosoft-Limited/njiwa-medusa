/**
 * Reading an order, and remembering what has already been said about it.
 *
 * Everything Medusa-shaped lives here so that the message rendering next door
 * stays plain TypeScript: it is handed an OrderView and has never heard of a
 * container, a query or a module.
 */

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/types"

import type { EventKey, OrderView } from "../modules/njiwa/templates"

/**
 * Exactly the fields the messages can use. Asking for the whole order would
 * pull thousands of rows of line item detail into memory to print a name and
 * a quantity.
 */
export const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "currency_code",
  "created_at",
  "total",
  "metadata",
  "items.title",
  "items.quantity",
  "items.variant_title",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.phone",
  "shipping_address.country_code",
  "billing_address.first_name",
  "billing_address.last_name",
  "billing_address.phone",
  "billing_address.country_code",
  "payment_collections.payments.provider_id",
]

export type LoadedOrder = Record<string, any>

/** What this plugin has already done about an order, kept on the order. */
export interface SentMarker {
  at: string
  to: string[]
  sent: boolean
  message_ids?: string[]
  error?: string
  code?: string
}

export async function loadOrder(
  container: MedusaContainer,
  orderId: string
): Promise<LoadedOrder | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { id: orderId },
  })

  return data?.[0]
}

/**
 * The order behind a payment.
 *
 * A payment belongs to a payment collection, and the payment collection is
 * linked to the order. It is two hops rather than one because those are the
 * two relations Medusa actually defines; asking for the order straight off a
 * payment would be a link that does not exist.
 */
export async function orderIdForPayment(
  container: MedusaContainer,
  paymentId: string
): Promise<string | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection_id"],
    filters: { id: paymentId },
  })

  const collectionId = payments?.[0]?.payment_collection_id
  if (!collectionId) {
    return undefined
  }

  const { data: collections } = await query.graph({
    entity: "payment_collection",
    fields: ["id", "order.id"],
    filters: { id: collectionId },
  })

  return collections?.[0]?.order?.id
}

/** The order behind a fulfillment, which is what shipment.created carries. */
export async function orderIdForFulfillment(
  container: MedusaContainer,
  fulfillmentId: string
): Promise<string | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "order.id"],
    filters: { id: fulfillmentId },
  })

  return data?.[0]?.order?.id
}

export function markerFor(order: LoadedOrder, event: EventKey): SentMarker | undefined {
  const markers = (order.metadata ?? {}).njiwa as Record<string, SentMarker> | undefined
  return markers?.[event]
}

/**
 * Write the marker back onto the order.
 *
 * The idempotency key covers a subscriber that runs twice inside 24 hours;
 * this covers everything after that, and it is also the only place a shop
 * owner can see what was sent, since Medusa 2 has no order notes.
 *
 * The whole metadata object is written back rather than the one key, because
 * an update replaces the field. Two of these landing in the same millisecond
 * could lose one another's marker, and the idempotency key is what stops that
 * turning into a second message.
 */
export async function writeMarker(
  container: MedusaContainer,
  order: LoadedOrder,
  event: EventKey,
  marker: SentMarker
): Promise<void> {
  const orders = container.resolve(Modules.ORDER)
  const metadata = { ...(order.metadata ?? {}) }
  const markers = { ...((metadata.njiwa ?? {}) as Record<string, SentMarker>) }

  markers[event] = marker
  metadata.njiwa = markers

  await orders.updateOrders(order.id, { metadata })
}

export interface ViewOptions {
  shopName: string
  storefrontOrderUrl: string
  adminUrl: string
  locale: string
}

/** An order, reduced to the words that go in a message. */
export function buildOrderView(order: LoadedOrder, options: ViewOptions): OrderView {
  const address = order.shipping_address ?? order.billing_address ?? {}
  const firstName = (address.first_name ?? "").trim()
  const lastName = (address.last_name ?? "").trim()

  const items = (order.items ?? []).map((item: Record<string, any>) => ({
    title: itemTitle(item),
    quantity: Math.round(toNumber(item.quantity)),
  }))

  return {
    firstName,
    lastName,
    customerName: [firstName, lastName].filter(Boolean).join(" "),
    orderNumber: order.display_id ? `#${order.display_id}` : order.id,
    orderTotal: money(toNumber(order.total), order.currency_code, options.locale),
    orderDate: date(order.created_at, options.locale),
    orderStatus: humanise(order.status),
    paymentMethod: paymentMethod(order),
    items,
    itemCount: items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0),
    shopName: options.shopName,
    orderUrl: options.storefrontOrderUrl
      ? options.storefrontOrderUrl.replace("{order_id}", String(order.id))
      : "",
    adminUrl: options.adminUrl ? `${options.adminUrl}/orders/${order.id}` : "",
  }
}

/** The phone number to message a customer on, already in WhatsApp's form. */
export function customerPhone(order: LoadedOrder): { phone: string; country: string } {
  const shipping = order.shipping_address ?? {}
  const billing = order.billing_address ?? {}

  // The shipping address is the one the customer expects to be contacted
  // about, and is the one Medusa fills in first. The billing address is the
  // fallback for a digital order that has no shipping address at all.
  const address = (shipping.phone ?? "").trim() !== "" ? shipping : billing

  return {
    phone: (address.phone ?? "").trim(),
    country: (address.country_code ?? "").trim(),
  }
}

function itemTitle(item: Record<string, any>): string {
  const title = (item.title ?? "").trim()
  const variant = (item.variant_title ?? "").trim()

  // "Blue shirt (M)" rather than "Blue shirt", so the customer can tell which
  // of two nearly identical lines is which.
  return variant !== "" && variant !== title ? `${title} (${variant})` : title
}

/**
 * Medusa keeps money as a big number, which arrives as a plain number, a
 * string or an object depending on how far it has travelled. All three mean
 * the same thing.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value !== null && typeof value === "object") {
    const holder = value as Record<string, unknown>
    if ("numeric" in holder) {
      return toNumber(holder.numeric)
    }
    if ("value" in holder) {
      return toNumber(holder.value)
    }
  }
  return 0
}

function money(amount: number, currency: unknown, locale: string): string {
  const code = String(currency ?? "").toUpperCase()
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(amount)
  } catch {
    // An unknown currency code is not a reason to send nothing.
    return `${code} ${amount.toFixed(2)}`.trim()
  }
}

function date(value: unknown, locale: string): string {
  const when = value instanceof Date ? value : new Date(String(value ?? ""))
  if (Number.isNaN(when.getTime())) {
    return ""
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(when)
}

function humanise(status: unknown): string {
  const text = String(status ?? "").replace(/_/g, " ").trim()
  return text === "" ? "" : text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Medusa names a payment provider by its id, "pp_stripe_stripe" or
 * "pp_system_default", and has no display name for it anywhere. The middle of
 * that is the only part a customer would recognise.
 */
function paymentMethod(order: LoadedOrder): string {
  const payments = (order.payment_collections ?? []).flatMap(
    (collection: Record<string, any>) => collection.payments ?? []
  )
  const providerId = String(payments[0]?.provider_id ?? "")
  if (providerId === "") {
    return ""
  }

  const provider = providerId.replace(/^pp_/, "").split("_")[0]
  if (provider === "system") {
    return "Manual"
  }

  return provider.charAt(0).toUpperCase() + provider.slice(1)
}
