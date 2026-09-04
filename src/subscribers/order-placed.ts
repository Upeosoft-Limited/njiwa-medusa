/**
 * An order was placed.
 *
 * order.placed is emitted when a cart becomes an order, and when a draft
 * order is confirmed. It is the first moment an order is real, which makes it
 * both the customer's "we have your order" and the one moment the shop owner
 * hears about it. A cart that reached the payment page and was abandoned
 * never gets here, which is the point: nobody is woken up for it.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { OrderWorkflowEvents } from "@medusajs/framework/utils"

import { notify } from "../lib/notify"

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await notify(container, "order_placed", data?.id)
  await notify(container, "new_order_alert", data?.id)
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
  context: { subscriberId: "njiwa-order-placed" },
}
