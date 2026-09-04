/**
 * Checking what somebody typed on the settings page before it is stored.
 *
 * Two jobs, deliberately separated. `reviewOverrides` is strict and is what
 * the admin route runs on a save: it refuses a setting that would quietly stop
 * messages going out, and it says what it is unhappy about in the words a shop
 * owner would use. `sanitiseOverrides` is lenient and is what reads the stored
 * value back: settings already in the database are not the moment to start
 * failing, so anything unrecognisable there is dropped and the boot option
 * behind it is used instead.
 *
 * Nothing in this file knows what Medusa is, so all of it is tested without a
 * database anywhere near it.
 */

import { MAX_MSISDN_DIGITS, MIN_MSISDN_DIGITS, parseList, rejectedFromList } from "./numbers"
import type { NjiwaOverrides } from "./options"
import { EVENT_KEYS, MAX_LENGTH, PLACEHOLDERS, type EventKey } from "./templates"

/** Long enough for any shop name worth having, short enough to be a name. */
const MAX_SHOP_NAME = 80

export interface OverrideReview {
  /** What to store. Only present when `problems` is empty. */
  overrides: NjiwaOverrides
  /** Why the save was refused. Anything here means nothing was stored. */
  problems: string[]
  /** Stored, but worth saying out loud. */
  warnings: string[]
}

/**
 * Read a stored override object back.
 *
 * Anything of the wrong shape is left out rather than repaired, so a hand
 * edited store row cannot turn into a setting nobody chose.
 */
export function sanitiseOverrides(raw: unknown): NjiwaOverrides {
  if (raw === null || typeof raw !== "object") {
    return {}
  }

  const given = raw as Record<string, unknown>
  const clean: NjiwaOverrides = {}

  if (typeof given.enabled === "boolean") {
    clean.enabled = given.enabled
  }

  for (const key of ["sendFrom", "shopName", "locale", "adminNumbers", "storefrontOrderUrl", "adminUrl"] as const) {
    if (typeof given[key] === "string") {
      clean[key] = given[key] as string
    }
  }

  const events = given.events
  if (events !== null && typeof events === "object") {
    const kept: NonNullable<NjiwaOverrides["events"]> = {}
    for (const key of EVENT_KEYS) {
      const event = (events as Record<string, unknown>)[key]
      if (event === null || typeof event !== "object") {
        continue
      }
      const holder = event as Record<string, unknown>
      const entry: { enabled?: boolean; template?: string } = {}
      if (typeof holder.enabled === "boolean") {
        entry.enabled = holder.enabled
      }
      if (typeof holder.template === "string") {
        entry.template = holder.template
      }
      if (entry.enabled !== undefined || entry.template !== undefined) {
        kept[key] = entry
      }
    }
    if (Object.keys(kept).length > 0) {
      clean.events = kept
    }
  }

  return clean
}

/** Check a save, and say plainly what is wrong with it. */
export function reviewOverrides(raw: unknown): OverrideReview {
  const problems: string[] = []
  const warnings: string[] = []

  if (raw === null || typeof raw !== "object") {
    return { overrides: {}, problems: ["There were no settings in the request."], warnings }
  }

  const given = raw as Record<string, unknown>
  const overrides: NjiwaOverrides = {}

  if (given.enabled !== undefined) {
    if (typeof given.enabled !== "boolean") {
      problems.push("Send WhatsApp messages has to be on or off.")
    } else {
      overrides.enabled = given.enabled
    }
  }

  if (given.sendFrom !== undefined) {
    const digits = String(given.sendFrom ?? "").replace(/\D/g, "")
    if (String(given.sendFrom ?? "").includes("@")) {
      problems.push("Send from is one of your own WhatsApp numbers, not a group address.")
    } else if (digits === "") {
      overrides.sendFrom = ""
    } else if (digits.startsWith("0")) {
      // A recipient's leading zero is read against the sending number's
      // country. The sending number has no such country to be read against,
      // so a 0 here is a number nobody can resolve.
      problems.push(
        "Send from needs the country code, such as 254712345678. A number starting with 0 has no country in it."
      )
    } else if (digits.length < MIN_MSISDN_DIGITS || digits.length > MAX_MSISDN_DIGITS) {
      problems.push(
        `Send from should be between ${MIN_MSISDN_DIGITS} and ${MAX_MSISDN_DIGITS} digits. Check it against the number in your Njiwa console.`
      )
    } else {
      overrides.sendFrom = digits
    }
  }

  if (given.shopName !== undefined) {
    const name = String(given.shopName ?? "").trim()
    if (name.length > MAX_SHOP_NAME) {
      problems.push(`Shop name is longer than ${MAX_SHOP_NAME} characters.`)
    } else {
      overrides.shopName = name
    }
  }

  if (given.locale !== undefined) {
    const locale = String(given.locale ?? "").trim()
    if (locale === "") {
      overrides.locale = ""
    } else if (!isLocale(locale)) {
      // Caught here rather than at send time, where an unknown locale would
      // quietly print money and dates in the wrong shape in a real message.
      problems.push(`${locale} is not a language tag. Try something like en-KE, en-GB or de-DE.`)
    } else {
      overrides.locale = locale
    }
  }

  if (given.adminNumbers !== undefined) {
    const typed = String(given.adminNumbers ?? "")
    const numbers = parseList(typed)
    const rejected = rejectedFromList(typed)

    if (rejected.some((piece) => piece.includes("@"))) {
      // parseList already drops these, so this is not a safety net; it is the
      // shop being told, because a group address here is somebody expecting
      // the whole group to be messaged and it never will be.
      warnings.push(
        "A group address was left out. Njiwa posts anything ending @g.us to a WhatsApp group, so this plugin only ever sends to phone numbers."
      )
    }

    const notGroups = rejected.filter((piece) => !piece.includes("@"))
    if (notGroups.length > 0) {
      warnings.push(
        `Not a usable phone number, so it was left out: ${notGroups.join(", ")}. Use the full international form, such as 254712345678.`
      )
    }

    overrides.adminNumbers = numbers.join(", ")
  }

  if (given.storefrontOrderUrl !== undefined) {
    const url = String(given.storefrontOrderUrl ?? "").trim()
    if (url !== "" && !isHttpUrl(url)) {
      problems.push("Your storefront order page has to be a full address beginning http:// or https://.")
    } else {
      if (url !== "" && !url.includes("{order_id}")) {
        warnings.push(
          "Your storefront order page has no {order_id} in it, so every customer's {order_url} points at the same page."
        )
      }
      overrides.storefrontOrderUrl = url
    }
  }

  if (given.adminUrl !== undefined) {
    const url = String(given.adminUrl ?? "").trim().replace(/\/+$/, "")
    if (url !== "" && !isHttpUrl(url)) {
      problems.push("Your admin address has to be a full address beginning http:// or https://.")
    } else {
      overrides.adminUrl = url
    }
  }

  if (given.events !== undefined) {
    if (given.events === null || typeof given.events !== "object") {
      problems.push("The events were not sent in a shape this page understands.")
    } else {
      overrides.events = reviewEvents(given.events as Record<string, unknown>, problems, warnings)
    }
  }

  return { overrides: problems.length > 0 ? {} : overrides, problems, warnings }
}

function reviewEvents(
  given: Record<string, unknown>,
  problems: string[],
  warnings: string[]
): NonNullable<NjiwaOverrides["events"]> {
  const events: NonNullable<NjiwaOverrides["events"]> = {}

  for (const [name, value] of Object.entries(given)) {
    if (!(EVENT_KEYS as readonly string[]).includes(name)) {
      // An unknown event key is a typo or an older version of this page. It is
      // refused rather than stored, because a setting that is silently ignored
      // is a shop believing it turned something on.
      problems.push(`${name} is not an event this plugin knows about.`)
      continue
    }

    const key = name as EventKey
    if (value === null || typeof value !== "object") {
      problems.push(`The settings for ${key} were not sent in a shape this page understands.`)
      continue
    }

    const holder = value as Record<string, unknown>
    const entry: { enabled?: boolean; template?: string } = {}

    if (holder.enabled !== undefined) {
      if (typeof holder.enabled !== "boolean") {
        problems.push(`${key} has to be on or off.`)
      } else {
        entry.enabled = holder.enabled
      }
    }

    if (holder.template !== undefined) {
      const template = String(holder.template ?? "")
      if ([...template].length > MAX_LENGTH) {
        problems.push(`The wording for ${key} is longer than ${MAX_LENGTH} characters.`)
      } else {
        entry.template = template
        const unknown = unknownPlaceholders(template)
        if (unknown.length > 0) {
          warnings.push(
            `The wording for ${key} uses ${unknown.join(", ")}, which is not a placeholder this plugin knows. It will be removed before sending.`
          )
        }
        if (template.trim() === "" && entry.enabled !== false) {
          warnings.push(
            `The wording for ${key} is empty, so that event is on but will send nothing. That is how a message is turned off; clear the switch instead if you meant to turn the event off.`
          )
        }
      }
    }

    events[key] = entry
  }

  return events
}

/** Anything in braces that the renderer would drop on the way out. */
export function unknownPlaceholders(template: string): string[] {
  const found = template.match(/\{[a-z_]+\}/g) ?? []
  return [...new Set(found.filter((token) => !Object.prototype.hasOwnProperty.call(PLACEHOLDERS, token)))]
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function isLocale(value: string): boolean {
  try {
    new Intl.NumberFormat(value)
    return true
  } catch {
    return false
  }
}
