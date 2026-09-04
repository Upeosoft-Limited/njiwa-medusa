/** Phone numbers, as people write them. */

import {
  MAX_MSISDN_DIGITS,
  parseList,
  rejectedFromList,
  toMsisdn,
} from "../src/modules/njiwa/numbers"

describe("toMsisdn", () => {
  it.each([
    "254712345678",
    "+254 712 345 678",
    "0712345678",
    "(0712) 345-678",
    "00254712345678",
  ])("reads %s the same way", (raw) => {
    expect(toMsisdn(raw, "KE")).toBe("254712345678")
  })

  it("lets a plus stop the country on the order having a say", () => {
    expect(toMsisdn("+44 7911 123456", "KE")).toBe("447911123456")
  })

  it("gives a local number its country", () => {
    expect(toMsisdn("07911 123456", "GB")).toBe("447911123456")
    expect(toMsisdn("(212) 555-1234", "US")).toBe("12125551234")
  })

  it("leaves a US number that already carries its 1 alone", () => {
    expect(toMsisdn("1 212 555 1234", "US")).toBe("12125551234")
  })

  it("does not care how Medusa cases a country code", () => {
    expect(toMsisdn("0712345678", "ke")).toBe("254712345678")
  })

  it("passes a number through when there is no country to reason with", () => {
    expect(toMsisdn("0712345678", "")).toBe("0712345678")
    expect(toMsisdn("0712345678", null)).toBe("0712345678")
    expect(toMsisdn("0712345678", "ZZ")).toBe("0712345678")
  })

  it("gives nothing back when there is nothing usable", () => {
    expect(toMsisdn("", "KE")).toBe("")
    expect(toMsisdn(null, "KE")).toBe("")
    expect(toMsisdn(undefined, "KE")).toBe("")
    expect(toMsisdn("call me", "KE")).toBe("")
    expect(toMsisdn("12345", "KE")).toBe("") // a typo, not a short Kenyan number
    expect(toMsisdn(`+${"9".repeat(MAX_MSISDN_DIGITS + 1)}`, "KE")).toBe("")
  })
})

describe("parseList", () => {
  it("takes them comma, space or newline separated", () => {
    expect(parseList("254700000001, 254700000002\n+254 700 000 003")).toEqual([
      "254700000001",
      "254700000002",
      "254700000003",
    ])
  })

  it("takes an array, because medusa-config.ts is TypeScript", () => {
    expect(parseList(["254700000001", "+254 700 000 002"])).toEqual([
      "254700000001",
      "254700000002",
    ])
  })

  it("collapses duplicates", () => {
    expect(parseList("254700000001, 254700000001")).toEqual(["254700000001"])
  })

  it("drops a WhatsApp group address whole", () => {
    expect(parseList("120363028712345678@g.us")).toEqual([])
    expect(parseList("120363028712345678@g.us, 254700000001")).toEqual(["254700000001"])
    expect(rejectedFromList("120363028712345678@g.us, 254700000001")).toEqual([
      "120363028712345678@g.us",
    ])
  })

  it("drops anything too short to be a number", () => {
    expect(parseList("12345, 254700000001")).toEqual(["254700000001"])
    expect(rejectedFromList("12345, 254700000001")).toEqual(["12345"])
  })

  it("has nothing to say about nothing", () => {
    expect(parseList("")).toEqual([])
    expect(parseList(null)).toEqual([])
    expect(parseList(undefined)).toEqual([])
  })
})
