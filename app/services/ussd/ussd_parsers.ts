/**
 * What a USSD answer can tell us, once the prose around it is stripped away.
 *
 * Every field is optional because operators answer one code with several
 * facts: a balance reply often carries the remaining SMS count too, and
 * throwing that away would mean asking a second time for something we were
 * already told.
 */
export type UssdParseResult = {
  /** Money, in tiyin. Integer, like every other money value here. */
  moneyBalance?: number
  currency?: string
  /** Messages the SIM can still send. */
  smsBalance?: number
  phoneNumber?: string
}

export type UssdParser = (raw: string) => UssdParseResult

/**
 * Currency names as operators write them, mapped to a code. Latin and Cyrillic
 * spellings both appear in the wild, sometimes in the same message.
 */
const CURRENCIES: [RegExp, string][] = [
  [/so'?m|so‘m|сум|сўм|uzs/i, 'UZS'],
  [/\busd\b|\$/i, 'USD'],
]

/**
 * A number as it appears in a USSD reply: thousands separated by spaces, dots
 * or commas, and the fractional part by either a dot or a comma.
 *
 * Written once and reused, because getting this wrong quietly turns 12 500
 * so'm into 12 so'm — a balance that reads as "empty" and parks the SIM.
 */
const AMOUNT = /(-?\d[\d\s.,\u00a0\u202f]*)/

/**
 * Turns an operator's amount into tiyin.
 *
 * The last separator decides: if it is followed by exactly two digits it is
 * the decimal point, otherwise every separator was a thousands group. That is
 * the only rule that reads both `12 500` and `12,50` correctly without knowing
 * which operator sent them.
 */
export function parseAmountToTiyin(text: string): number | null {
  const cleaned = text.replace(/[\s\u00a0\u202f]/g, '')
  if (!/\d/.test(cleaned)) return null

  const match = cleaned.match(/^(-?)([\d.,]+)$/)
  if (!match) return null

  const [, sign, digits] = match
  const lastSeparator = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','))

  let whole = digits
  let fraction = '0'

  if (lastSeparator !== -1 && digits.length - lastSeparator - 1 === 2) {
    whole = digits.slice(0, lastSeparator)
    fraction = digits.slice(lastSeparator + 1)
  }

  const wholeDigits = whole.replace(/[.,]/g, '')
  if (wholeDigits === '') return null

  const tiyin = Number(wholeDigits) * 100 + Number(fraction.padEnd(2, '0'))

  return sign === '-' ? -tiyin : tiyin
}

function detectCurrency(raw: string): string | undefined {
  for (const [pattern, code] of CURRENCIES) {
    if (pattern.test(raw)) return code
  }
  return undefined
}

/**
 * Money balance from a free form reply.
 *
 * Deliberately generic: every operator says "balance" differently but they all
 * put an amount next to a currency, and matching on that survives the wording
 * changing. A per operator parser is registered below only where this is not
 * enough.
 */
function genericBalance(raw: string): UssdParseResult {
  const currency = detectCurrency(raw)

  /**
   * Prefer an amount that sits next to a currency word; fall back to the first
   * number in the message. Without the preference a reply that opens with a
   * date or an account number would be read as the balance.
   */
  const nearCurrency = raw.match(
    new RegExp(`${AMOUNT.source}\\s*(?:so'?m|so‘m|сум|сўм|uzs|usd|\\$)`, 'i')
  )

  const amount = nearCurrency ?? raw.match(AMOUNT)
  if (!amount) return {}

  const moneyBalance = parseAmountToTiyin(amount[1])
  if (moneyBalance === null) return {}

  return { moneyBalance, currency }
}

/**
 * Remaining message count. Looks for a number introduced or followed by an SMS
 * word, since a reply usually mentions minutes and megabytes in the same
 * breath and the first number is rarely the one we want.
 */
function genericSmsBalance(raw: string): UssdParseResult {
  const labelled =
    raw.match(/(?:sms|смс)[^\d\-]{0,20}(\d+)/i) ?? raw.match(/(\d+)\s*(?:ta\s*)?(?:sms|смс)/i)

  if (!labelled) return {}

  const smsBalance = Number(labelled[1])

  return Number.isFinite(smsBalance) ? { smsBalance } : {}
}

/**
 * The SIM's own number, which a freshly inserted SIM cannot otherwise tell us.
 * Normalised to E.164 for Uzbekistan, where every mobile number is nine digits
 * after the country code.
 */
function genericPhoneNumber(raw: string): UssdParseResult {
  const match = raw.match(/(?:\+?998)?[\s(-]*(\d{2})[\s)-]*(\d{3})[\s-]*(\d{2})[\s-]*(\d{2})/)
  if (!match) return {}

  const [, a, b, c, d] = match

  return { phoneNumber: `+998${a}${b}${c}${d}` }
}

/**
 * Parsers by key. The key lives on `operator_ussd_commands.parser_key`, so a
 * new operator is a seeded row plus, only if its replies need it, one function
 * here.
 */
const PARSERS: Record<string, UssdParser> = {
  'generic.balance': genericBalance,
  'generic.sms_balance': genericSmsBalance,
  'generic.phone_number': genericPhoneNumber,

  /**
   * Every Uzbek operator currently answers in a shape the generic parsers
   * read correctly. They are mapped explicitly rather than falling through so
   * that fixing one operator's parsing cannot change another's.
   */
  'ucell.balance': genericBalance,
  'ucell.sms_balance': genericSmsBalance,
  'beeline.balance': genericBalance,
  'beeline.sms_balance': genericSmsBalance,
  'mobiuz.balance': genericBalance,
  'mobiuz.sms_balance': genericSmsBalance,
  'uzmobile.balance': genericBalance,
  'humans.balance': genericBalance,
}

export function hasParser(key: string): boolean {
  return key in PARSERS
}

/**
 * Runs a parser. An unknown key or an unreadable reply returns nothing rather
 * than throwing: the raw response is stored either way, so a parser that has
 * fallen behind an operator's wording costs a balance reading, not a request.
 */
export function parseUssdResponse(parserKey: string, raw: string | null): UssdParseResult {
  if (!raw) return {}

  const parser = PARSERS[parserKey]
  if (!parser) return {}

  try {
    return parser(raw)
  } catch {
    return {}
  }
}
