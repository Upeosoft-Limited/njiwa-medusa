/**
 * Money went back.
 *
 * payment.refunded fires for each refund recorded against a payment, and a
 * refund can be for part of an order. The message does not name an amount for
 * that reason, and the marker on the order means a second, later refund does
 * not send a second message.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PaymentEvents } from "@medusajs/framework/utils"

import { notify } from "../lib/notify"
import { orderIdForPayment } from "../lib/orders"

export default async function paymentRefundedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id ? await orderIdForPayment(container, data.id) : undefined

  if (!orderId) {
    return
  }

  await notify(container, "refund_created", orderId)
}

export const config: SubscriberConfig = {
  event: PaymentEvents.REFUNDED,
  context: { subscriberId: "njiwa-payment-refunded" },
}
