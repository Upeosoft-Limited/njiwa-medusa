/**
 * The settings, and where each of them comes from.
 *
 * There are two layers. The plugin options in medusa-config.ts are the boot
 * layer: they are read once when Medusa starts and they are where a secret
 * belongs. On top of them sit the overrides a shop saves on the Njiwa page in
 * the Medusa admin, which are read fresh on every send, so changing wording or
 * turning an event on takes effect without a deploy or a restart.
 *
 * The API key and the Njiwa address stay in the boot layer on purpose. Medusa
 * offers a plugin no encrypted place to keep a secret, and the store metadata
 * the overrides live in is plain text that every admin user can read back, so
 * a key saved there would be a key handed to everyone with a dashboard login.
 * BOOT_ONLY_SETTINGS below is that list, and the admin page reads it rather
 * than repeating it.
 *
 * Two rules are not negotiable and are enforced by the defaults here:
 * installing this plugin sends nothing until somebody turns an event on, and
 * every event has wording that works unedited.
 */

import { defaultTemplate, EVENT_KEYS, type EventKey } from "./templates"

export const DEFAULT_BASE_URL = "https://njiwa.upeo.ai"

export interface NjiwaEventOptions {
  /** Off until somebody turns it on. Installing a plugin must never send. */
  enabled?: boolean
  /** Leave it out for the wording in templates.ts. Empty string sends nothing. */
  template?: string
}

export interface NjiwaPluginOptions {
  /** The master switch. False keeps every setting and sends nothing. */
  enabled?: boolean
  /** sk_test_ delivers nothing; sk_live_ sends to real phones. */
  apiKey?: string
  /** Leave it alone unless you were given your own Njiwa address. */
  baseUrl?: string
  /** Which of your linked numbers sends. Empty means the account default. */
  sendFrom?: string
  /** Your shop name, for {shop_name}. Empty uses the name of your Medusa store. */
  shopName?: string
  /** How money and dates are written in messages, such as en-KE or de-DE. */
  locale?: string
  /** Where the new-order alert goes. A string of numbers, or an array. */
  adminNumbers?: string | string[]
  /**
   * Your storefront's order page, with {order_id} where the id goes, so
   * {order_url} has something to be. Empty leaves {order_url} empty.
   */
  storefrontOrderUrl?: string
  /**
   * Where your Medusa admin can be reached from a phone, for {admin_url}.
   * Empty falls back to the admin.backendUrl in your medusa-config.ts.
   */
  adminUrl?: string
  events?: Partial<Record<EventKey, NjiwaEventOptions>>
}

/** The same settings with every gap filled in, which is what the code reads. */
export interface NjiwaSettings {
  enabled: boolean
  apiKey: string
  baseUrl: string
  sendFrom: string
  shopName: string
  locale: string
  adminNumbers: string
  storefrontOrderUrl: string
  adminUrl: string
  events: Record<EventKey, { enabled: boolean; template: string }>
}

export function resolveSettings(options: NjiwaPluginOptions | undefined): NjiwaSettings {
  const given = options ?? {}
  const events = {} as NjiwaSettings["events"]

  for (const key of EVENT_KEYS) {
    const event = given.events?.[key] ?? {}
    events[key] = {
      enabled: event.enabled === true,
      // A shop that turned an event on and never wrote any wording still has
      // a message to send. Only an explicit empty string means "send nothing".
      template: typeof event.template === "string" ? event.template : defaultTemplate(key),
    }
  }

  return {
    // The master switch defaults to on, because every event underneath it is
    // off. The switch exists to stop a shop that is already sending, in one
    // move, without losing its key or its wording.
    enabled: given.enabled !== false,
    apiKey: (given.apiKey ?? "").trim(),
    baseUrl: ((given.baseUrl ?? "").trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    sendFrom: (given.sendFrom ?? "").replace(/\D/g, ""),
    shopName: (given.shopName ?? "").trim(),
    locale: (given.locale ?? "").trim() || "en-US",
    adminNumbers: Array.isArray(given.adminNumbers)
      ? given.adminNumbers.join(",")
      : (given.adminNumbers ?? "").trim(),
    storefrontOrderUrl: (given.storefrontOrderUrl ?? "").trim(),
    adminUrl: (given.adminUrl ?? "").trim().replace(/\/+$/, ""),
    events,
  }
}

/**
 * The settings a shop can change in the Medusa admin, exactly as they are
 * stored on the store row.
 *
 * Anything left out is inherited from medusa-config.ts. A shop that configures
 * everything in code and never opens the page keeps working, and a shop that
 * edits one field overrides that one field and nothing else.
 */
export interface NjiwaOverrides {
  enabled?: boolean
  sendFrom?: string
  shopName?: string
  locale?: string
  adminNumbers?: string
  storefrontOrderUrl?: string
  adminUrl?: string
  events?: Partial<Record<EventKey, NjiwaEventOptions>>
}

/**
 * The settings the admin page shows but will not save.
 *
 * They are boot options because one is a secret and the other decides where
 * that secret is sent: an admin who could repoint baseUrl could collect the
 * key. Both are named in the README with this same reason.
 */
export const BOOT_ONLY_SETTINGS = ["apiKey", "baseUrl"] as const

/**
 * The boot settings with whatever the shop saved in the admin laid over them.
 *
 * "Not saved" and "saved as empty" are different things: an override is only
 * applied when the key is actually present, so clearing the shop name in the
 * admin is a decision that sticks rather than a silent fall back to config.
 */
export function mergeSettings(
  boot: NjiwaSettings,
  overrides: NjiwaOverrides | undefined
): NjiwaSettings {
  const given = overrides ?? {}
  const events = {} as NjiwaSettings["events"]

  for (const key of EVENT_KEYS) {
    const override = given.events?.[key] ?? {}
    events[key] = {
      enabled: typeof override.enabled === "boolean" ? override.enabled : boot.events[key].enabled,
      template:
        typeof override.template === "string" ? override.template : boot.events[key].template,
    }
  }

  return {
    ...boot,
    enabled: typeof given.enabled === "boolean" ? given.enabled : boot.enabled,
    // The sending number is the one place a leading zero is genuinely
    // ambiguous, so it is stored as digits and checked before it is saved.
    sendFrom: typeof given.sendFrom === "string" ? given.sendFrom.replace(/\D/g, "") : boot.sendFrom,
    shopName: typeof given.shopName === "string" ? given.shopName.trim() : boot.shopName,
    locale:
      typeof given.locale === "string" && given.locale.trim() !== ""
        ? given.locale.trim()
        : boot.locale,
    adminNumbers:
      typeof given.adminNumbers === "string" ? given.adminNumbers.trim() : boot.adminNumbers,
    storefrontOrderUrl:
      typeof given.storefrontOrderUrl === "string"
        ? given.storefrontOrderUrl.trim()
        : boot.storefrontOrderUrl,
    adminUrl:
      typeof given.adminUrl === "string"
        ? given.adminUrl.trim().replace(/\/+$/, "")
        : boot.adminUrl,
    events,
  }
}

/** A test key checks and stores every message and delivers nothing. */
export function isTestKey(apiKey: string): boolean {
  return apiKey.startsWith("sk_test_")
}
