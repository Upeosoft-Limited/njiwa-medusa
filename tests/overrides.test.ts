/**
 * What the settings page is allowed to save.
 *
 * These are the checks that stand between a form somebody typed into and a
 * setting that would quietly stop messages going out, or send one somewhere it
 * should not go. None of it needs a database, so all of it is tested here.
 */

import { mergeSettings, resolveSettings } from "../src/modules/njiwa/options"
import { reviewOverrides, sanitiseOverrides } from "../src/modules/njiwa/overrides"
import { defaultTemplate } from "../src/modules/njiwa/templates"

describe("mergeSettings", () => {
  const boot = resolveSettings({
    apiKey: "sk_test_abc",
    shopName: "Duka",
    adminNumbers: "254712345678",
    events: { order_placed: { enabled: true } },
  })

  it("keeps the boot options when nothing was saved", () => {
    const settings = mergeSettings(boot, {})
    expect(settings.shopName).toBe("Duka")
    expect(settings.events.order_placed.enabled).toBe(true)
    expect(settings.events.payment_captured.enabled).toBe(false)
  })

  it("lets a saved setting win, including one saved as empty", () => {
    const settings = mergeSettings(boot, { shopName: "", adminNumbers: "254733000111" })
    expect(settings.shopName).toBe("")
    expect(settings.adminNumbers).toBe("254733000111")
  })

  it("overrides one event without disturbing the others", () => {
    const settings = mergeSettings(boot, { events: { payment_captured: { enabled: true } } })
    expect(settings.events.payment_captured.enabled).toBe(true)
    expect(settings.events.payment_captured.template).toBe(defaultTemplate("payment_captured"))
    expect(settings.events.order_placed.enabled).toBe(true)
  })

  it("never lets a stored setting reach the API key", () => {
    const settings = mergeSettings(boot, { apiKey: "sk_live_stolen" } as never)
    expect(settings.apiKey).toBe("sk_test_abc")
  })
})

describe("sanitiseOverrides", () => {
  it("drops anything of the wrong shape rather than repairing it", () => {
    const clean = sanitiseOverrides({
      enabled: "yes",
      shopName: "Duka",
      events: { order_placed: { enabled: true }, not_an_event: { enabled: true } },
    })
    expect(clean.enabled).toBeUndefined()
    expect(clean.shopName).toBe("Duka")
    expect(clean.events).toEqual({ order_placed: { enabled: true } })
  })

  it("survives a store row with nothing useful in it", () => {
    expect(sanitiseOverrides(null)).toEqual({})
    expect(sanitiseOverrides("njiwa")).toEqual({})
  })
})

describe("reviewOverrides", () => {
  it("accepts an ordinary save", () => {
    const review = reviewOverrides({
      enabled: true,
      sendFrom: "+254 712 345 678",
      adminNumbers: "0712345678, 254733000111",
      locale: "en-KE",
      events: { order_placed: { enabled: true, template: "Hi {first_name}" } },
    })
    expect(review.problems).toEqual([])
    expect(review.overrides.sendFrom).toBe("254712345678")
  })

  it("refuses a sending number with no country in it", () => {
    const review = reviewOverrides({ sendFrom: "0712345678" })
    expect(review.problems).toHaveLength(1)
    expect(review.overrides).toEqual({})
  })

  it("leaves a WhatsApp group out of your own numbers and says so", () => {
    const review = reviewOverrides({ adminNumbers: "254712345678, 120363028712345678@g.us" })
    expect(review.overrides.adminNumbers).toBe("254712345678")
    expect(review.warnings.join(" ")).toContain("group")
  })

  it("refuses an event nobody has heard of", () => {
    const review = reviewOverrides({ events: { order_shipped: { enabled: true } } })
    expect(review.problems).toHaveLength(1)
  })

  it("warns about a placeholder that does not exist", () => {
    const review = reviewOverrides({
      events: { order_placed: { enabled: true, template: "Order {order_no}" } },
    })
    expect(review.problems).toEqual([])
    expect(review.warnings.join(" ")).toContain("{order_no}")
  })

  it("warns when an event is on with no wording behind it", () => {
    const review = reviewOverrides({ events: { order_placed: { enabled: true, template: "  " } } })
    expect(review.warnings.join(" ")).toContain("send nothing")
  })

  it("refuses a storefront address that is not one", () => {
    expect(reviewOverrides({ storefrontOrderUrl: "shop.example.com" }).problems).toHaveLength(1)
  })
})
