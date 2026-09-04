/**
 * POST /admin/njiwa/test-message
 *
 * Sends one fixed message to one number you name, and reports what really
 * happened. The wording is fixed in the code: the operator supplies the
 * recipient and nothing else, so this route cannot be turned into a way of
 * sending arbitrary WhatsApp messages from the shop's own number. The Send
 * test message button on the Njiwa settings page is this route.
 *
 * POST only, and behind Medusa's admin authentication like every other route
 * under /admin.
 */

import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { loadShop } from "../../../../lib/settings"
import { parseList } from "../../../../modules/njiwa/numbers"
import { answerWithError, makeRateLimit } from "../shared"

/** Five in five minutes is plenty for setting a shop up, and cheap to be wrong about. */
const take = makeRateLimit(5, 5 * 60_000)

export const POST = async (
  req: AuthenticatedMedusaRequest<{ to?: string }>,
  res: MedusaResponse
) => {
  // The settings are read before anything else happens, and a store that
  // cannot be read is answered rather than thrown: this route is the one place
  // an operator finds out why.
  const shop = await loadShop(req.scope).catch((error: unknown) => {
    answerWithError(res, error)
    return undefined
  })

  if (!shop) {
    return
  }

  const { njiwa, settings } = shop

  const asked = (req.body?.to ?? "").toString().trim()
  const fallback = parseList(settings.adminNumbers)[0]
  const candidate = asked !== "" ? asked : (fallback ?? "")

  if (candidate === "") {
    res.status(400).json({
      ok: false,
      code: "no_recipient",
      message:
        'Say who to send to, as {"to": "254712345678"}, or put your own number in "Your WhatsApp numbers" on the settings page and it will go there.',
    })
    return
  }

  // parseList is what keeps a WhatsApp group address out of this. A value
  // ending @g.us is a group, and Njiwa will post to it: one press of a test
  // button could message hundreds of people from the shop's own number.
  const numbers = parseList(candidate)
  if (numbers.length !== 1) {
    res.status(400).json({
      ok: false,
      code: "bad_recipient",
      message:
        "Send to one phone number, digits only, in full international form, such as 254712345678. " +
        "Group addresses and lists are not accepted here.",
    })
    return
  }

  if (!take()) {
    res.status(429).json({
      ok: false,
      code: "too_many_requests",
      message: "Five test messages in five minutes is the limit. Wait a little and try again.",
    })
    return
  }

  try {
    const answer = await njiwa.sendTestMessage(settings, numbers[0])
    res.json({
      ok: true,
      to: numbers[0],
      id: answer.id ?? null,
      test_key: njiwa.isTestKey(settings),
      message: njiwa.isTestKey(settings)
        ? `Accepted for +${numbers[0]}. This is a test key, so nothing actually reached the phone.`
        : `Sent to +${numbers[0]}.`,
    })
  } catch (error) {
    answerWithError(res, error)
  }
}
