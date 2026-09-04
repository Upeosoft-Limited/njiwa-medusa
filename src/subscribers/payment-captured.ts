/**
 * The money arrived.
 *
 * payment.captured carries the payment, not the order, so the order is found
 * through the payment collection the payment belongs to. A shop that captures
 * in two parts will emit this twice; the marker on the order means the
 * customer is told once.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PaymentEvents } from "@medusajs/framework/utils"

import { notify } from "../lib/notify"
import { orderIdForPayment } from "../lib/orders"

export default async function paymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id ? await orderIdForPayment(container, data.id) : undefined

  // A payment with no order behind it is a payment collection that was never
  // linked to one. There is nobody to message, and nothing has gone wrong.
  if (!orderId) {
    return
  }

  await notify(container, "payment_captured", orderId)
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
  context: { subscriberId: "njiwa-payment-captured" },
}
