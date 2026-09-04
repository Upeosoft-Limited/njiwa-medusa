/**
 * Talking to Njiwa. Transport only.
 *
 * Nothing in here decides when to message anybody. It takes the settings,
 * makes the call, and turns a refusal into an error the rest of the plugin
 * can read. Node's own fetch is used rather than a client library, so this
 * plugin adds no runtime dependency to a Medusa install.
 */

import { NjiwaError } from "./errors"
import type { NjiwaSettings } from "./options"

/** Long enough for a slow line, short enough that nothing holds a worker. */
export const TIMEOUT_MS = 20_000

export interface NjiwaMessage {
  id?: string
  status?: string
  [key: string]: unknown
}

export interface NjiwaInstance {
  id?: string
  label?: string
  msisdn?: string
  status?: string
  is_default?: boolean
  [key: string]: unknown
}

export class NjiwaClient {
  constructor(
    private readonly settings: NjiwaSettings,
    private readonly userAgent: string
  ) {}

  /**
   * Send one text message.
   *
   * `idempotencyKey` is for anything that must not go twice. Njiwa honours it
   * for 24 hours, so a subscriber that runs twice replays the first answer
   * instead of messaging the customer again.
   */
  async sendText(to: string, text: string, idempotencyKey = ""): Promise<NjiwaMessage> {
    const headers: Record<string, string> = {}
    if (idempotencyKey !== "") {
      headers["Idempotency-Key"] = idempotencyKey
    }

    const body: Record<string, unknown> = { to, text }

    // Only when the shop named a number. Left out, Njiwa uses the account's
    // default, which is the right answer for the shops that have one number
    // and never think about this again.
    if (this.settings.sendFrom !== "") {
      body.from = this.settings.sendFrom
    }

    return this.request("POST", "/v1/messages", body, headers)
  }

  /** The WhatsApp numbers on this account, linked or not. */
  async instances(): Promise<NjiwaInstance[]> {
    const answer = await this.request("GET", "/v1/instances")
    return Array.isArray(answer.data) ? (answer.data as NjiwaInstance[]) : []
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    headers: Record<string, string> = {}
  ): Promise<Record<string, any>> {
    // The master switch has to fail here rather than shrug. Somebody who
    // turned it off and forgot needs to find a line in a log saying so, not
    // silence that looks exactly like a working shop.
    if (!this.settings.enabled) {
      throw new NjiwaError(
        "Sending is switched off in the njiwa-medusa plugin options (enabled: false), so nothing was sent.",
        "disabled"
      )
    }

    if (this.settings.apiKey === "") {
      throw new NjiwaError(
        "There is no Njiwa API key in the njiwa-medusa plugin options, so nothing can be sent.",
        "not_configured"
      )
    }

    let response: Response
    try {
      response = await fetch(`${this.settings.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          Accept: "application/json",
          "User-Agent": this.userAgent,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      // A network failure is not a send failure: the message was never
      // accepted, so trying again later is safe.
      const reason = error instanceof Error ? error.message : String(error)
      throw new NjiwaError(
        `Could not reach Njiwa at ${this.settings.baseUrl}. ${reason}`,
        "connection_failed"
      )
    }

    let decoded: Record<string, any> = {}
    try {
      const parsed = await response.json()
      if (parsed !== null && typeof parsed === "object") {
        decoded = parsed as Record<string, any>
      }
    } catch {
      // A body that is not JSON tells us nothing the status code has not
      // already said, and a proxy's HTML error page is not worth repeating.
      decoded = {}
    }

    if (response.status >= 400) {
      const error = (decoded.error ?? {}) as Record<string, any>
      throw new NjiwaError(
        String(error.message ?? `Njiwa answered with HTTP ${response.status}.`),
        String(error.code ?? "unknown"),
        response.status,
        typeof error.docs === "string" ? error.docs : undefined
      )
    }

    return decoded
  }
}
