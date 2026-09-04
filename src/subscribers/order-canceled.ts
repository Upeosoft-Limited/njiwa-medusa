/**
 * The order was cancelled.
 *
 * Worth sending. A cancellation nobody explained is what turns into a phone
 * call.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { OrderWorkflowEvents } from "@medusajs/framework/utils"

import { notify } from "../lib/notify"

export default async function orderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await notify(container, "order_canceled", data?.id)
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.CANCELED,
  context: { subscriberId: "njiwa-order-canceled" },
}
