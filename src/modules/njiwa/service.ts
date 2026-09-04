/**
 * The one thing in the plugin that can send.
 *
 * It is a Medusa module service for a practical reason: Medusa hands the
 * plugin options to every module a plugin ships, so a subscriber and an admin
 * route both resolve this one object and see exactly the same boot options.
 * There are no data models, so the module owns no tables and needs no
 * migrations.
 *
 * What it deliberately does not do is decide what the settings are. A Medusa
 * module is isolated from the rest of the application and cannot resolve the
 * store the overrides are saved on, so lib/settings.ts loads them and hands a
 * finished NjiwaSettings to every method here. That is why nothing on this
 * class reads `this.boot` except as a fallback.
 */

import { createHash } from "node:crypto"

import type { Logger } from "@medusajs/framework/types"

import { NjiwaClient, type NjiwaInstance, type NjiwaMessage } from "./client"
import { isTestKey, resolveSettings, type NjiwaPluginOptions, type NjiwaSettings } from "./options"
import { render, type EventKey, type OrderView } from "./templates"

/** Kept in step with the version in package.json by hand; it is one line. */
export const NJIWA_MEDUSA_VERSION = "0.1.0"

type InjectedDependencies = {
  logger: Logger
}

export default class NjiwaService {
  /** The settings as medusa-config.ts left them, before any admin override. */
  readonly boot: NjiwaSettings

  private readonly logger: Logger
  private readonly userAgent: string

  constructor({ logger }: InjectedDependencies, options: NjiwaPluginOptions) {
    this.logger = logger
    this.boot = resolveSettings(options)
    this.userAgent = `njiwa-medusa/${NJIWA_MEDUSA_VERSION}`
  }

  /**
   * Whether this shop could send at all. An event being on is a separate
   * question, asked per event, and asked after this one.
   */
  isConfigured(settings: NjiwaSettings): boolean {
    return settings.enabled && settings.apiKey !== ""
  }

  isTestKey(settings: NjiwaSettings): boolean {
    return isTestKey(settings.apiKey)
  }

  /**
   * The wording for one event, filled in from an order.
   *
   * An empty string means the shop cleared the template, which is how one
   * message is turned off without turning the event off, and it is the
   * caller's job to notice and send nothing.
   */
  messageFor(settings: NjiwaSettings, event: EventKey, view: OrderView): string {
    return render(settings.events[event].template, view, (unknown) => {
      this.logger.warn(
        `njiwa: the ${event} template uses ${unknown.join(", ")}, which is not a placeholder ` +
          `this plugin knows. It was removed before sending. The Njiwa settings page lists the ones that exist.`
      )
    })
  }

  /** Send one message for one order, once. */
  async sendForOrder(
    settings: NjiwaSettings,
    installation: string,
    event: EventKey,
    orderId: string,
    to: string,
    text: string
  ): Promise<NjiwaMessage> {
    return this.clientFor(settings).sendText(
      to,
      text,
      this.idempotencyKey(installation, event, orderId, to)
    )
  }

  /** The fixed message behind the Send test message button. */
  async sendTestMessage(settings: NjiwaSettings, to: string): Promise<NjiwaMessage> {
    const shop = settings.shopName || "your Medusa shop"
    return this.clientFor(settings).sendText(
      to,
      `Test message from ${shop}. If you can read this, Medusa can reach your customers on WhatsApp.`
    )
  }

  async instances(settings: NjiwaSettings): Promise<NjiwaInstance[]> {
    return this.clientFor(settings).instances()
  }

  /**
   * One key per installation, per order, per event, per recipient.
   *
   * Njiwa honours it for 24 hours, so a subscriber that runs twice, or an
   * event bus that retries after a timeout, replays the first answer instead
   * of messaging the customer again. The recipient is part of the key because
   * one new-order alert can go to several of your own numbers, and those must
   * not collapse into one another. `installation` is the Medusa store id: it
   * keeps two shops sharing one Njiwa account apart, and unlike a name or an
   * address it does not change when somebody edits a setting, which would
   * otherwise reopen the door to a second message.
   */
  idempotencyKey(installation: string, event: EventKey, orderId: string, to: string): string {
    return `mds-${short(installation, 8)}-${orderId}-${event}-${short(to, 6)}`
  }

  /**
   * A client is built per call rather than held, because the settings behind
   * it can change between one message and the next without a restart. It owns
   * no connection and no state, so this costs nothing.
   */
  private clientFor(settings: NjiwaSettings): NjiwaClient {
    return new NjiwaClient(settings, this.userAgent)
  }
}

function short(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length)
}
