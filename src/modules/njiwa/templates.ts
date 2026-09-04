/**
 * The message itself.
 *
 * A template is plain text with placeholders in braces. Every placeholder a
 * shop can use is listed in PLACEHOLDERS below, and the README prints that
 * same list, so the documentation cannot drift away from the code.
 *
 * Nothing in this file knows what Medusa is. It is handed an OrderView, which
 * is the small, already-formatted picture of an order that lib/order-view.ts
 * builds, so the rendering can be tested without a database behind it.
 */

/** WhatsApp takes 4096 characters. Stopping short leaves room for a footer. */
export const MAX_LENGTH = 4000

/** How many order lines {items} prints before it starts counting instead. */
export const MAX_ITEMS = 10

/**
 * The seven moments this plugin can message somebody about. The keys are the
 * ones a shop writes in medusa-config.ts, so they are named after the moment
 * rather than after the Medusa event that carries it.
 */
export const EVENT_KEYS = [
  "order_placed",
  "payment_captured",
  "fulfillment_created",
  "shipment_created",
  "order_canceled",
  "refund_created",
  "new_order_alert",
] as const

export type EventKey = (typeof EVENT_KEYS)[number]

/** An order, reduced to the words that go in a message. */
export interface OrderView {
  firstName: string
  lastName: string
  customerName: string
  orderNumber: string
  orderTotal: string
  orderDate: string
  orderStatus: string
  paymentMethod: string
  items: Array<{ title: string; quantity: number }>
  itemCount: number
  shopName: string
  orderUrl: string
  adminUrl: string
}

/** Placeholder to what it is replaced with, in the shop's own words. */
export const PLACEHOLDERS: Record<string, string> = {
  "{first_name}": 'The first name on the order, or "there" if the order has none.',
  "{last_name}": "The last name on the order.",
  "{customer_name}": "Both names together.",
  "{order_number}": "The order number as the customer sees it, such as #1042.",
  "{order_total}": "The total, with your currency.",
  "{order_date}": "The date the order was placed.",
  "{order_status}": "The order status at the moment the message is sent.",
  "{payment_method}": "How they paid, as the payment provider on the order.",
  "{items}": 'One line per item, as "2 x Blue shirt".',
  "{item_count}": "How many items in total.",
  "{shop_name}": "Your shop name.",
  "{order_url}": "A link the customer can open to see their own order. Empty unless you set storefrontOrderUrl.",
  "{admin_url}": "A link that opens the order in your Medusa admin. Only put this in the message to yourself.",
}

/**
 * What each message says before anybody edits it.
 *
 * They live in code rather than in medusa-config.ts because a shop that has
 * turned an event on and written no wording must still send something
 * sensible, and because a default that only exists in an example config is a
 * default nobody has.
 *
 * They are deliberately short. A WhatsApp message that reads like an email
 * gets read like an email, which is to say not at all.
 */
const DEFAULT_TEMPLATES: Record<EventKey, string> = {
  order_placed:
    "Hi {first_name}, we have your order {order_number} for {order_total}. We will let you know as soon as it is on its way.\n\n{items}\n\n{shop_name}",
  payment_captured:
    "Hi {first_name}, thank you. Your payment for order {order_number} has gone through and we are getting it ready.\n\nTotal {order_total}\n{shop_name}",
  fulfillment_created:
    "Hi {first_name}, order {order_number} has been packed and is leaving us shortly.\n\n{shop_name}",
  shipment_created:
    "Hi {first_name}, order {order_number} is on its way to you. Thank you for shopping with {shop_name}.",
  order_canceled:
    "Hi {first_name}, order {order_number} has been cancelled and you have not been charged. If that was not you, reply to this message and we will look into it.\n\n{shop_name}",
  refund_created:
    "Hi {first_name}, we have refunded your payment for order {order_number}. Banks take a few days to show it.\n\n{shop_name}",
  new_order_alert:
    "New order {order_number} on {shop_name}.\n\n{customer_name}\n{item_count} item(s), {order_total}\nPaid by {payment_method}\n\n{admin_url}",
}

/**
 * What each event is called on the settings page, and when it is worth having.
 *
 * The page renders whatever the settings route hands it rather than keeping
 * its own copy of this, so the words a merchant reads and the events the
 * server actually has cannot drift apart.
 */
export const EVENT_LABELS: Record<EventKey, string> = {
  order_placed: "Order placed",
  payment_captured: "Payment received",
  fulfillment_created: "Packed",
  shipment_created: "On its way",
  order_canceled: "Cancelled",
  refund_created: "Refunded",
  new_order_alert: "Tell me about new orders",
}

export const EVENT_HELP: Record<EventKey, string> = {
  order_placed:
    "The moment the order becomes real. For bank transfer, cash on delivery and anything else placed before the money arrives, this is the one that says you have it.",
  payment_captured: "The one most shops want. The money has landed and you are getting the order ready.",
  fulfillment_created:
    "Sent when somebody in the shop packs the order. Most shops want this one or the next one, not both.",
  shipment_created: "Sent when the order is handed to a courier.",
  order_canceled: "Worth sending. A cancellation nobody explained is what turns into a phone call.",
  refund_created:
    "Money is on its way back. Saying so stops the \"where is my refund\" message before it is sent.",
  new_order_alert:
    "One message to you when an order comes in. It goes to your own numbers below, never to the customer.",
}

export function defaultTemplate(event: EventKey): string {
  return DEFAULT_TEMPLATES[event] ?? ""
}

/**
 * Fill a template in from an order.
 *
 * Returns "" when the template is empty, which is how a shop turns one
 * message off without turning the event off.
 *
 * `onUnknownPlaceholder` is called with anything still in braces after the
 * substitution. That is a placeholder that does not exist, usually a typo,
 * and sending "{order_no}" to a customer looks broken, so it comes out and
 * the shop is told where to look.
 */
export function render(
  template: string,
  view: OrderView,
  onUnknownPlaceholder?: (found: string[]) => void
): string {
  const raw = (template ?? "").trim()
  if (raw === "") {
    return ""
  }

  const values = valuesFor(view)
  const unknown = new Set<string>()

  // One pass over the template, never over what was substituted into it. A
  // product called "{sale}" is then just a product name, and not something
  // that gets eaten on the way out.
  let message = raw.replace(/\{[a-z_]+\}/g, (token) => {
    if (Object.prototype.hasOwnProperty.call(values, token)) {
      return values[token]
    }
    unknown.add(token)
    return ""
  })

  if (unknown.size > 0) {
    onUnknownPlaceholder?.([...unknown])
  }

  message = message.replace(/\n{3,}/g, "\n\n").trim()

  if ([...message].length > MAX_LENGTH) {
    message = [...message].slice(0, MAX_LENGTH - 1).join("") + "…"
  }

  return message
}

function valuesFor(view: OrderView): Record<string, string> {
  return {
    "{first_name}": view.firstName.trim() || "there",
    "{last_name}": view.lastName ?? "",
    "{customer_name}": (view.customerName ?? "").trim(),
    "{order_number}": view.orderNumber ?? "",
    "{order_total}": view.orderTotal ?? "",
    "{order_date}": view.orderDate ?? "",
    "{order_status}": view.orderStatus ?? "",
    "{payment_method}": view.paymentMethod ?? "",
    "{items}": itemLines(view.items ?? []),
    "{item_count}": String(view.itemCount ?? 0),
    "{shop_name}": view.shopName ?? "",
    "{order_url}": view.orderUrl ?? "",
    "{admin_url}": view.adminUrl ?? "",
  }
}

function itemLines(items: Array<{ title: string; quantity: number }>): string {
  const lines = items.slice(0, MAX_ITEMS).map((item) => `${item.quantity} x ${item.title}`)
  const more = items.length - lines.length

  if (more > 0) {
    lines.push(more === 1 ? "and 1 more item" : `and ${more} more items`)
  }

  return lines.join("\n")
}
