/**
 * Turning what a customer typed into a number WhatsApp can reach.
 *
 * People write their number the way they say it: 0712 345 678, (071) 234-5678,
 * +254 712 345 678. WhatsApp needs one form. Medusa keeps an address phone
 * exactly as it was typed, and the country on that same address is what makes
 * a local number unambiguous, which is why nothing here guesses.
 */

/**
 * WhatsApp msisdns are 7 to 15 digits. E.164 caps the whole number at 15,
 * country code included. The same limits Njiwa applies, repeated here so a
 * number is refused for the same reason the API would refuse it.
 */
export const MIN_MSISDN_DIGITS = 7
export const MAX_MSISDN_DIGITS = 15

const NOT_DIGITS = /\D/g

/**
 * ISO 3166 country code to calling code.
 *
 * WooCommerce can ask WooCommerce for this. Medusa's region and country
 * tables carry names and ISO codes and no calling codes at all, so the list
 * ships here. It is the whole list rather than the countries anybody expects,
 * because a shortlist quietly mis-reads a number from a country nobody
 * thought of. Only ever consulted to complete a local number; a number
 * already written in full is never checked against it.
 */
export const CALLING_CODES: Record<string, string> = {
  AD: "376", AE: "971", AF: "93", AG: "1268", AI: "1264", AL: "355",
  AM: "374", AO: "244", AR: "54", AS: "1684", AT: "43", AU: "61",
  AW: "297", AX: "358", AZ: "994", BA: "387", BB: "1246", BD: "880",
  BE: "32", BF: "226", BG: "359", BH: "973", BI: "257", BJ: "229",
  BL: "590", BM: "1441", BN: "673", BO: "591", BQ: "599", BR: "55",
  BS: "1242", BT: "975", BW: "267", BY: "375", BZ: "501", CA: "1",
  CC: "61", CD: "243", CF: "236", CG: "242", CH: "41", CI: "225",
  CK: "682", CL: "56", CM: "237", CN: "86", CO: "57", CR: "506",
  CU: "53", CV: "238", CW: "599", CX: "61", CY: "357", CZ: "420",
  DE: "49", DJ: "253", DK: "45", DM: "1767", DO: "1809", DZ: "213",
  EC: "593", EE: "372", EG: "20", EH: "212", ER: "291", ES: "34",
  ET: "251", FI: "358", FJ: "679", FK: "500", FM: "691", FO: "298",
  FR: "33", GA: "241", GB: "44", GD: "1473", GE: "995", GF: "594",
  GG: "44", GH: "233", GI: "350", GL: "299", GM: "220", GN: "224",
  GP: "590", GQ: "240", GR: "30", GT: "502", GU: "1671", GW: "245",
  GY: "592", HK: "852", HN: "504", HR: "385", HT: "509", HU: "36",
  ID: "62", IE: "353", IL: "972", IM: "44", IN: "91", IO: "246",
  IQ: "964", IR: "98", IS: "354", IT: "39", JE: "44", JM: "1876",
  JO: "962", JP: "81", KE: "254", KG: "996", KH: "855", KI: "686",
  KM: "269", KN: "1869", KP: "850", KR: "82", KW: "965", KY: "1345",
  KZ: "7", LA: "856", LB: "961", LC: "1758", LI: "423", LK: "94",
  LR: "231", LS: "266", LT: "370", LU: "352", LV: "371", LY: "218",
  MA: "212", MC: "377", MD: "373", ME: "382", MF: "590", MG: "261",
  MH: "692", MK: "389", ML: "223", MM: "95", MN: "976", MO: "853",
  MP: "1670", MQ: "596", MR: "222", MS: "1664", MT: "356", MU: "230",
  MV: "960", MW: "265", MX: "52", MY: "60", MZ: "258", NA: "264",
  NC: "687", NE: "227", NF: "672", NG: "234", NI: "505", NL: "31",
  NO: "47", NP: "977", NR: "674", NU: "683", NZ: "64", OM: "968",
  PA: "507", PE: "51", PF: "689", PG: "675", PH: "63", PK: "92",
  PL: "48", PM: "508", PR: "1787", PS: "970", PT: "351", PW: "680",
  PY: "595", QA: "974", RE: "262", RO: "40", RS: "381", RU: "7",
  RW: "250", SA: "966", SB: "677", SC: "248", SD: "249", SE: "46",
  SG: "65", SH: "290", SI: "386", SJ: "47", SK: "421", SL: "232",
  SM: "378", SN: "221", SO: "252", SR: "597", SS: "211", ST: "239",
  SV: "503", SX: "1721", SY: "963", SZ: "268", TC: "1649", TD: "235",
  TG: "228", TH: "66", TJ: "992", TK: "690", TL: "670", TM: "993",
  TN: "216", TO: "676", TR: "90", TT: "1868", TV: "688", TW: "886",
  TZ: "255", UA: "380", UG: "256", US: "1", UY: "598", UZ: "998",
  VA: "39", VC: "1784", VE: "58", VG: "1284", VI: "1340", VN: "84",
  VU: "678", WF: "681", WS: "685", XK: "383", YE: "967", YT: "262",
  ZA: "27", ZM: "260", ZW: "263",
}

/**
 * Digits only, in full international form, or "" if there is nothing usable.
 *
 * `phone` is as the customer typed it. `country` is the ISO code from the
 * same address, such as KE. Medusa stores country codes in lower case, which
 * is why this does not care about the case.
 */
export function toMsisdn(phone: string | null | undefined, country?: string | null): string {
  const raw = (phone ?? "").trim()
  let digits = raw.replace(NOT_DIGITS, "")
  if (digits === "") {
    return ""
  }

  // A leading + or 00 is the customer saying "this is the whole number".
  // Believe them, and stop before the country on the address gets a say:
  // somebody living abroad who buys with an address at home would otherwise
  // have their own country code treated as a local number and a second one
  // stuck in front of it.
  const alreadyInternational = raw.startsWith("+") || digits.startsWith("00")

  // 00 is how much of the world dials out.
  if (digits.startsWith("00")) {
    digits = digits.slice(2)
  }

  if (alreadyInternational) {
    return bounded(digits)
  }

  const code = CALLING_CODES[(country ?? "").trim().toUpperCase()] ?? ""
  if (code === "") {
    // No country to reason with. Send it as written and let Njiwa resolve it
    // against the sending number's own country.
    return bounded(digits)
  }

  // Already international. The length test is what stops a national number
  // that happens to open with its own country's digits being mistaken for
  // one, which is a real hazard in +1 countries.
  if (digits.startsWith(code) && digits.length >= code.length + MIN_MSISDN_DIGITS) {
    return bounded(digits)
  }

  // The trunk prefix: the 0 you dial at home and never abroad.
  const national = digits.replace(/^0+/, "")

  // The bounds are checked on the national part as well as on the finished
  // number. Without this, "12345" on a Kenyan order becomes 25412345, which
  // is eight digits and passes every length test while being nobody's phone
  // number: a country code is not enough to turn a typo into a number.
  if (national.length < MIN_MSISDN_DIGITS) {
    return ""
  }

  return bounded(code + national)
}

/**
 * Too few digits is a typo, too many is not a phone number. Either way,
 * nothing is sent rather than a message to a stranger.
 */
function bounded(digits: string): string {
  return digits.length >= MIN_MSISDN_DIGITS && digits.length <= MAX_MSISDN_DIGITS ? digits : ""
}

/**
 * A list typed by the shop owner: one per line, or separated by commas.
 *
 * Digits and nothing else, as many of them as an msisdn has. "Contains a
 * digit" would not do: 120363028712345678@g.us contains plenty, and Njiwa
 * reads an address ending @g.us as a WhatsApp group without looking at the
 * rest, so one new order would post to a group of hundreds from the shop's
 * own number. A piece with an @ in it is dropped whole, not cleaned up.
 */
export function parseList(raw: string | string[] | null | undefined): string[] {
  const found: string[] = []

  for (const piece of pieces(raw)) {
    if (piece.includes("@")) {
      continue
    }
    const digits = piece.replace(NOT_DIGITS, "")
    if (bounded(digits) !== "" && !found.includes(digits)) {
      found.push(digits)
    }
  }

  return found
}

/** The pieces parseList threw away, so a check can say which. */
export function rejectedFromList(raw: string | string[] | null | undefined): string[] {
  return pieces(raw).filter(
    (piece) => piece.includes("@") || bounded(piece.replace(NOT_DIGITS, "")) === ""
  )
}

/**
 * medusa-config.ts is a TypeScript file, so a shop can write the numbers as
 * one string or as an array. Both are ordinary things to write, so both work.
 *
 * A space is not a separator here, because "+254 700 000 003" is how people
 * write one number and splitting on the spaces would turn it into four
 * fragments and then into nothing. Two numbers run together with only a space
 * between them make one impossibly long number, which is rejected rather than
 * quietly turned into a message to a stranger.
 */
function pieces(raw: string | string[] | null | undefined): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : (raw ?? "")
  return text
    .split(/[,;\r\n]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== "")
}
