/**
 * The items were fulfilled.
 *
 * This is the moment somebody in the shop packed the order, which is not the
 * same moment as handing it to a courier. Medusa emits shipment.created for
 * that, and this plugin has a separate message for it: a shop that turns both
 * on is telling the customer twice on purpose.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { OrderWorkflowEvents } from "@medusajs/framework/utils"

import { notify } from "../lib/notify"
import { orderIdForFulfillment } from "../lib/orders"

type FulfillmentCreated = {
  id?: string
  order_id?: string
  fulfillment_id?: string
  no_notification?: boolean
}

export default async function fulfillmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<FulfillmentCreated>) {
  // The event carries the order, and the fulfillment is only looked up when it
  // does not. Reading one field and not the other is how this event turns into
  // a message that never goes without anything ever looking wrong.
  const fulfillmentId = data?.fulfillment_id ?? data?.id
  const orderId =
    data?.order_id ??
    (fulfillmentId ? await orderIdForFulfillment(container, fulfillmentId) : undefined)

  if (!orderId) {
    return
  }

  await notify(container, "fulfillment_created", orderId, {
    suppressed: data?.no_notification === true,
  })
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.FULFILLMENT_CREATED,
  context: { subscriberId: "njiwa-fulfillment-created" },
}
