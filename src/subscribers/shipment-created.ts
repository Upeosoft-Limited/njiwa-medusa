/**
 * It is on its way.
 *
 * The shipment event names the fulfillment that was marked shipped, and
 * depending on which side of Medusa emitted it the payload carries the order
 * as well or only the fulfillment. Both shapes are read here, and the order is
 * looked up through the fulfillment only when the event did not say. Reading
 * one field and not the other is how this event turns into a message that
 * never goes without anything ever looking wrong.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { FulfillmentWorkflowEvents } from "@medusajs/framework/utils"

import { notify } from "../lib/notify"
import { orderIdForFulfillment } from "../lib/orders"

type ShipmentCreated = {
  id?: string
  order_id?: string
  fulfillment_id?: string
  no_notification?: boolean
}

export default async function shipmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<ShipmentCreated>) {
  const fulfillmentId = data?.fulfillment_id ?? data?.id
  const orderId =
    data?.order_id ??
    (fulfillmentId ? await orderIdForFulfillment(container, fulfillmentId) : undefined)

  // A fulfillment that belongs to no order is a shipment created directly
  // through the Fulfillment module, which no customer is waiting on.
  if (!orderId) {
    return
  }

  await notify(container, "shipment_created", orderId, {
    suppressed: data?.no_notification === true,
  })
}

export const config: SubscriberConfig = {
  event: FulfillmentWorkflowEvents.SHIPMENT_CREATED,
  context: { subscriberId: "njiwa-shipment-created" },
}
