/**
 * GET and POST /admin/njiwa/settings
 *
 * What the Njiwa page in the Medusa admin reads and writes. The page holds no
 * copy of the event list, the wording defaults or the placeholder list: it
 * renders whatever this route hands it, so what a merchant reads on the screen
 * and what the server will actually do cannot drift apart.
 *
 * Like every route under /admin it is behind Medusa's admin authentication.
 * The API key is never returned, only whether there is one and whether it is a
 * test key, because a settings page that prints a secret is a secret in every
 * browser history and screen recording of that page.
 */

import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { loadShop, saveOverrides, type Shop } from "../../../../lib/settings"
import { BOOT_ONLY_SETTINGS } from "../../../../modules/njiwa/options"
import { reviewOverrides } from "../../../../modules/njiwa/overrides"
import {
  defaultTemplate,
  EVENT_HELP,
  EVENT_KEYS,
  EVENT_LABELS,
  MAX_LENGTH,
  PLACEHOLDERS,
} from "../../../../modules/njiwa/templates"
import { answerWithError } from "../shared"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  try {
    res.json(view(await loadShop(req.scope)))
  } catch (error) {
    answerWithError(res, error)
  }
}

export const POST = async (req: AuthenticatedMedusaRequest<unknown>, res: MedusaResponse) => {
  const review = reviewOverrides(req.body)

  if (review.problems.length > 0) {
    // Nothing is stored when anything is wrong. A half saved settings page is
    // how a shop ends up with an event on and no number to send to.
    res.status(400).json({
      ok: false,
      code: "invalid_settings",
      message: review.problems.join(" "),
      problems: review.problems,
      warnings: review.warnings,
    })
    return
  }

  try {
    const shop = await saveOverrides(req.scope, review.overrides)
    res.json({ ...view(shop), warnings: review.warnings, saved_now: true })
  } catch (error) {
    answerWithError(res, error)
  }
}

/** Everything the page needs, in one answer. */
function view(shop: Shop) {
  const { njiwa, settings, declared } = shop

  return {
    ok: true,
    // The fields are the settings as they were declared, not as they were
    // resolved: showing the store name in the shop name box would save it back
    // as a fixed name the next time somebody pressed Save.
    settings: {
      enabled: settings.enabled,
      sendFrom: settings.sendFrom,
      shopName: declared.shopName,
      locale: settings.locale,
      adminNumbers: settings.adminNumbers,
      storefrontOrderUrl: settings.storefrontOrderUrl,
      adminUrl: declared.adminUrl,
      events: Object.fromEntries(
        EVENT_KEYS.map((key) => [
          key,
          { enabled: settings.events[key].enabled, template: settings.events[key].template },
        ])
      ),
    },
    // The settings that are not on this page, and why. The page prints this
    // rather than keeping its own wording for it.
    boot_only: {
      names: [...BOOT_ONLY_SETTINGS],
      api_key_set: settings.apiKey !== "",
      test_key: njiwa.isTestKey(settings),
      base_url: settings.baseUrl,
      why: "The API key and the Njiwa address stay in medusa-config.ts. Medusa gives a plugin nowhere encrypted to keep a secret, and anything saved here is plain text that every admin user can read back. Change them in your environment and restart Medusa.",
    },
    events: EVENT_KEYS.map((key) => ({
      key,
      label: EVENT_LABELS[key],
      help: EVENT_HELP[key],
      audience: key === "new_order_alert" ? "you" : "customer",
      default_template: defaultTemplate(key),
    })),
    fallbacks: shop.fallbacks,
    placeholders: PLACEHOLDERS,
    max_length: MAX_LENGTH,
    store: {
      id: shop.storeId,
      name: shop.storeName,
      readable: shop.storeReadable,
    },
    warnings: [] as string[],
    saved_now: false,
  }
}
