/**
 * The Njiwa module.
 *
 * Medusa registers this automatically for any project that lists the plugin
 * in medusa-config.ts, and hands it the plugin's own options. Nothing else in
 * the plugin reads those options directly: everything resolves this module and
 * then asks lib/settings.ts, which lays whatever the shop saved in the admin
 * over them, so there is one answer to "what are the settings" everywhere.
 */

import { Module } from "@medusajs/framework/utils"

import NjiwaService from "./service"

export const NJIWA_MODULE = "njiwa"

export default Module(NJIWA_MODULE, {
  service: NjiwaService,
})

export { NjiwaService }
export * from "./errors"
export * from "./options"
export * from "./overrides"
export * from "./templates"
