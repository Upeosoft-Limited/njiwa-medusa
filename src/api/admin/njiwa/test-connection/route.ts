/**
 * GET /admin/njiwa/test-connection
 *
 * Asks Njiwa which numbers this key can send from, and says plainly what it
 * found. It sends no message to anybody. The Test connection button on the
 * Njiwa settings page is this route.
 *
 * Every route under /admin is behind Medusa's admin authentication, so this
 * needs no guard of its own. It deliberately does not opt out of that.
 */

import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { loadShop } from "../../../../lib/settings"
import { answerWithError, makeRateLimit } from "../shared"

const take = makeRateLimit(20, 60_000)

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  if (!take()) {
    res.status(429).json({
      ok: false,
      code: "too_many_requests",
      message: "That is a lot of checking. Wait a minute and try again.",
    })
    return
  }

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
  const notes: string[] = []

  if (njiwa.isTestKey(settings)) {
    notes.push(
      "This is a test key. Every message is checked and stored, and nothing reaches WhatsApp. " +
        "Swap it for a key beginning sk_live_ when you are ready."
    )
  }

  let numbers
  try {
    numbers = await njiwa.instances(settings)
  } catch (error) {
    answerWithError(res, error)
    return
  }

  if (numbers.length === 0) {
    notes.push(
      "The key works, but this account has no numbers yet. Add one in the Njiwa console under Numbers and link it."
    )
  }

  const sendFrom = settings.sendFrom
  if (sendFrom !== "" && !numbers.some((number) => number.msisdn === sendFrom)) {
    notes.push(
      `Send from is ${sendFrom}, which is not a number on this account, so every message will be refused. ` +
        "Correct it, or clear it to use the number marked default."
    )
  }

  res.json({
    ok: true,
    base_url: settings.baseUrl,
    test_key: njiwa.isTestKey(settings),
    enabled: settings.enabled,
    events_on: Object.entries(settings.events)
      .filter(([, event]) => event.enabled)
      .map(([name]) => name),
    numbers: numbers.map((number) => ({
      label: number.label ?? "",
      msisdn: number.msisdn ?? null,
      status: number.status ?? "",
      is_default: number.is_default ?? false,
    })),
    notes,
  })
}
