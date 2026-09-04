/**
 * The one path every subscriber takes.
 *
 * A subscriber works out which order an event is about and calls notify().
 * Everything after that — is the event on, has this order already been told,
 * is there a number to send to, what does the message say, what happened when
 * we sent it — happens here, once, in one place.
 *
 * Nothing in here is allowed to throw. Medusa 2 runs subscribers on the event
 * bus, well after the storefront has been answered, so a failure cannot cost
 * a shop a sale; but an unhandled rejection in a Node process is still a bad
 * way to find out that a WhatsApp message did not go.
 */

import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Logger, MedusaContainer } from "@medusajs/types"

import { NjiwaError } from "../modules/njiwa/errors"
import { parseList, toMsisdn } from "../modules/njiwa/numbers"
import type { EventKey } from "../modules/njiwa/templates"
import {
  buildOrderView,
  customerPhone,
  loadOrder,
  markerFor,
  writeMarker,
  type LoadedOrder,
  type SentMarker,
} from "./orders"
import { loadShop, type Shop } from "./settings"

export interface NotifyOptions {
  /**
   * Medusa's fulfillment and shipment events carry no_notification, which is
   * the merchant ticking "do not tell the customer" as they fulfil. It means
   * what it says, so this honours it.
   */
  suppressed?: boolean
}

export async function notify(
  container: MedusaContainer,
  event: EventKey,
  orderId: string | undefined,
  options: NotifyOptions = {}
): Promise<void> {
  let logger: Logger | undefined

  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)

    // The settings as they are saved right now, not as they were when Medusa
    // started, so an event turned on in the admin a minute ago is on.
    const shop = await loadShop(container)
    const { njiwa, settings } = shop

    if (!settings.events[event].enabled) {
      return
    }

    // The event is on, so this shop asked for this message. Not being able to
    // send it is worth saying out loud: silence here looks exactly like a
    // working shop that had nothing to say.
    if (!njiwa.isConfigured(settings)) {
      logger?.warn(
        `njiwa: ${event} is turned on but nothing can be sent, because ` +
          (settings.enabled
            ? "there is no Njiwa API key in the plugin options."
            : "Send WhatsApp messages is switched off on the Njiwa settings page.")
      )
      return
    }

    if (!orderId) {
      logger?.warn(`njiwa: a ${event} event arrived without an order behind it, so nothing was sent.`)
      return
    }

    if (options.suppressed) {
      logger?.info(
        `njiwa: ${event} on order ${orderId} was marked "do not notify the customer", so nothing was sent.`
      )
      return
    }

    const order = await loadOrder(container, orderId)
    if (!order) {
      logger?.warn(`njiwa: order ${orderId} could not be read, so the ${event} message was not sent.`)
      return
    }

    // An order can reach the same moment twice: a second capture, a second
    // fulfillment, an event bus replaying its queue after a restart. The
    // customer does not need telling twice.
    if (markerFor(order, event)?.sent) {
      return
    }

    const recipients = recipientsFor(shop, event, order)
    if (recipients.length === 0) {
      // Neither of these is a fault. They are the two ordinary reasons a shop
      // sends nothing, and they are logged because "why did nothing happen"
      // is the first question somebody asks.
      logger?.info(
        event === "new_order_alert"
          ? `njiwa: no new-order alert for order ${orderId}, because there is no usable number in "Your WhatsApp numbers".`
          : `njiwa: no ${event} message for order ${orderId}, because the order has no phone number on it.`
      )
      return
    }

    const view = buildOrderView(order, settings)
    const message = njiwa.messageFor(settings, event, view)
    if (message === "") {
      logger?.warn(
        `njiwa: the ${event} wording is empty, so order ${orderId} sent nothing. ` +
          `Empty wording is how a message is turned off; if that was not the intention, put the wording back.`
      )
      return
    }

    await deliver(container, shop, logger, order, event, recipients, message)
  } catch (error) {
    // Anything that reaches here is a fault in this plugin or in Medusa
    // rather than something the shop can act on. It is written down, the
    // order is untouched, and the shop carries on.
    const reason = error instanceof Error ? error.message : String(error)
    logger?.error(`njiwa: ${event} for order ${orderId ?? "unknown"} failed unexpectedly. ${reason}`)
  }
}

async function deliver(
  container: MedusaContainer,
  shop: Shop,
  logger: Logger | undefined,
  order: LoadedOrder,
  event: EventKey,
  recipients: string[],
  message: string
): Promise<void> {
  const { njiwa, settings } = shop
  const sent: string[] = []
  const ids: string[] = []
  let failure: NjiwaError | undefined

  for (const to of recipients) {
    try {
      const answer = await njiwa.sendForOrder(
        settings,
        installationOf(shop),
        event,
        order.id,
        to,
        message
      )
      sent.push(to)
      ids.push(String(answer.id ?? "?"))
      logger?.info(
        `njiwa: ${event} sent to +${to} for order ${order.id} (${answer.id ?? "?"}).` +
          (njiwa.isTestKey(settings) ? " Test key, so nothing reached WhatsApp." : "")
      )
    } catch (error) {
      failure = error instanceof NjiwaError ? error : new NjiwaError(String(error))
      logger?.error(
        `njiwa: could not send ${event} to +${to} for order ${order.id}. ` +
          `${failure.message} (${failure.code})`
      )
    }
  }

  const marker: SentMarker = {
    at: new Date().toISOString(),
    to: recipients,
    // Only a message Njiwa accepted counts as sent. A failed attempt leaves
    // the marker unset, so the same event arriving again is free to try
    // again, and Njiwa's own idempotency key is what stops that becoming a
    // second message to somebody who already got the first.
    sent: sent.length > 0 && failure === undefined,
    ...(ids.length > 0 ? { message_ids: ids } : {}),
    ...(failure ? { error: failure.message, code: failure.code } : {}),
  }

  try {
    await writeMarker(container, order, event, marker)
  } catch (error) {
    // The message went. Failing to write it down is worth a line in the log
    // and nothing more; the idempotency key still holds for 24 hours.
    const reason = error instanceof Error ? error.message : String(error)
    logger?.warn(`njiwa: could not record the ${event} message on order ${order.id}. ${reason}`)
  }
}

function recipientsFor(shop: Shop, event: EventKey, order: LoadedOrder): string[] {
  if (event === "new_order_alert") {
    // Your own numbers, never the customer's. parseList drops anything that
    // is not a phone number, including a WhatsApp group address.
    return parseList(shop.settings.adminNumbers)
  }

  const { phone, country } = customerPhone(order)
  const number = toMsisdn(phone, country)

  // A customer without a usable phone number is ordinary, not an error.
  // Nothing is sent and nothing is complained about.
  return number === "" ? [] : [number]
}

/**
 * What goes in the idempotency key to tell two shops on one Njiwa account
 * apart. The store id never changes; the fallback is only for the case where
 * the store row could not be read at all, where one installation is the
 * safest assumption.
 */
function installationOf(shop: Shop): string {
  return shop.storeId || "single"
}
