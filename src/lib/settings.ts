/**
 * Where the settings actually come from, at the moment they are needed.
 *
 * The plugin options in medusa-config.ts are the boot layer. On top of them
 * sit the overrides a shop saves on the Njiwa page in the Medusa admin, kept
 * in the store's own metadata. That is why this file exists outside the
 * module: a Medusa module is isolated and cannot resolve the Store module, so
 * the merging happens out here where the container is a real container.
 *
 * The store row is read on every send rather than cached. It is one row by
 * primary key next to the order query that follows it, and reading it each
 * time is what makes turning an event on take effect now rather than after the
 * next restart, which was the whole point of having a settings page.
 */

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/types"

import { NJIWA_MODULE, type NjiwaService } from "../modules/njiwa"
import { mergeSettings, type NjiwaOverrides, type NjiwaSettings } from "../modules/njiwa/options"
import { sanitiseOverrides } from "../modules/njiwa/overrides"

/** Everything a caller needs to decide whether and what to send. */
export interface Shop {
  njiwa: NjiwaService
  /** The boot options with the saved overrides laid over them, and the gaps
   *  filled in. This is what a message is built from. */
  settings: NjiwaSettings
  /**
   * The same settings before the store name and the Medusa config fill any
   * gap. The settings page shows these, so an empty field stays empty and a
   * shop that renames itself keeps following its own name rather than having
   * yesterday's name saved over the top of it.
   */
  declared: NjiwaSettings
  /** What an empty field falls back to, so the page can say so. */
  fallbacks: { shopName: string; adminUrl: string }
  /** Only what is actually stored, so the page can show what it inherits. */
  saved: NjiwaOverrides
  /**
   * The Medusa store id, used as the installation in every idempotency key.
   * Empty when the store could not be read, which is handled rather than
   * thrown: a shop with an unreadable store row still has messages to send.
   */
  storeId: string
  /** The store's own name, which is what {shop_name} falls back to. */
  storeName: string
  /** Whether the saved overrides could be read at all. */
  storeReadable: boolean
}

type StoreRow = { id?: string; name?: string; metadata?: Record<string, unknown> | null }

export async function loadShop(container: MedusaContainer): Promise<Shop> {
  const njiwa = container.resolve<NjiwaService>(NJIWA_MODULE)

  // A store that cannot be read is not a reason to stop sending. The boot
  // options are a complete set of settings on their own, so this falls back to
  // them and says so rather than throwing on the way to a customer's message.
  let store: StoreRow | undefined
  try {
    store = await readStore(container)
  } catch {
    store = undefined
  }

  const saved = sanitiseOverrides(store?.metadata?.njiwa)

  const merged = mergeSettings(njiwa.boot, saved)
  const storeName = (store?.name ?? "").trim()
  const configuredAdminUrl = adminUrlFromConfig(container)

  return {
    njiwa,
    saved,
    declared: merged,
    fallbacks: { shopName: storeName, adminUrl: configuredAdminUrl },
    storeId: store?.id ?? "",
    storeName,
    storeReadable: store !== undefined,
    settings: {
      ...merged,
      // The shop's own name is the sensible answer when nobody has typed one,
      // and it is read here so the message renderer never has to ask Medusa
      // anything.
      shopName: merged.shopName || storeName,
      // A shop that has told Medusa where its dashboard is has already
      // answered this; the setting is only for the shops that have not.
      adminUrl: merged.adminUrl || configuredAdminUrl,
    },
  }
}

/**
 * Store the overrides, keeping whatever else lives in the store metadata.
 *
 * The whole metadata object is written back because an update replaces the
 * field, so reading it, changing one key and writing it whole is the only way
 * not to throw away somebody else's key.
 */
export async function saveOverrides(
  container: MedusaContainer,
  overrides: NjiwaOverrides
): Promise<Shop> {
  const store = await readStore(container)
  if (!store?.id) {
    throw new Error(
      "Medusa has no store to save these settings on, so nothing was stored. This is unusual: a Medusa install creates one when it is seeded."
    )
  }

  const metadata: Record<string, unknown> = { ...(store.metadata ?? {}) }
  metadata.njiwa = overrides

  const stores = container.resolve(Modules.STORE)
  await stores.updateStores(store.id, { metadata })

  return loadShop(container)
}

async function readStore(container: MedusaContainer): Promise<StoreRow | undefined> {
  const stores = container.resolve(Modules.STORE)
  const found = await stores.listStores({}, { take: 1 })
  return (found?.[0] as StoreRow | undefined) ?? undefined
}

/**
 * Where this Medusa can be reached, according to Medusa itself.
 */
function adminUrlFromConfig(container: MedusaContainer): string {
  try {
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE) as {
      admin?: { backendUrl?: string; path?: string }
    }
    const backend = (config.admin?.backendUrl ?? "").replace(/\/+$/, "")
    if (backend === "") {
      return ""
    }
    return `${backend}${config.admin?.path ?? "/app"}`.replace(/\/+$/, "")
  } catch {
    return ""
  }
}
