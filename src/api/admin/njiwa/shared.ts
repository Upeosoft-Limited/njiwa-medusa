/**
 * Bits both admin routes need.
 *
 * Only files called route.ts are loaded as API routes, so this one sits next
 * to them without becoming an endpoint of its own.
 */

import type { MedusaResponse } from "@medusajs/framework/http"

import { NjiwaError } from "../../../modules/njiwa/errors"

/**
 * Turn a Njiwa failure into an answer.
 *
 * A refusal from Njiwa is reported as a bad gateway rather than passed
 * through with its own status, because a 401 from Njiwa returned by an admin
 * route reads as "your admin session expired", which is the one thing it does
 * not mean. Njiwa's own code is in the body, and the code is the stable thing
 * to branch on.
 */
export function answerWithError(res: MedusaResponse, error: unknown): void {
  if (error instanceof NjiwaError) {
    const settingsFault = error.code === "disabled" || error.code === "not_configured"
    res.status(settingsFault ? 400 : 502).json({
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.docs ? { docs: error.docs } : {}),
    })
    return
  }

  res.status(500).json({
    ok: false,
    code: "unexpected",
    message: error instanceof Error ? error.message : String(error),
  })
}

/**
 * A very small rate limit, held in memory.
 *
 * It exists so that a button somebody is leaning on cannot spend a shop's
 * WhatsApp allowance, not to defend the API: it counts per process, so two
 * Medusa instances allow twice as much. Both admin routes are behind Medusa's
 * own admin authentication already, so the person tripping this is somebody
 * who is allowed to be here.
 */
export function makeRateLimit(allowed: number, windowMs: number) {
  const hits: number[] = []

  return function take(): boolean {
    const now = Date.now()
    while (hits.length > 0 && now - hits[0] > windowMs) {
      hits.shift()
    }
    if (hits.length >= allowed) {
      return false
    }
    hits.push(now)
    return true
  }
}
