import { parsePhoneNumberFromString } from 'libphonenumber-js'
import DomainException from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'

/**
 * Default region for numbers written without a country code. Tenants in this
 * market routinely send `901234567` or `+998 90 123 45 67` for the same
 * subscriber, and both must resolve to one canonical value.
 */
const DEFAULT_REGION = 'UZ'

export type NormalizedNumber = {
  /** Canonical E.164 form, e.g. `+998901234567`. */
  e164: string
  /** National significant number, e.g. `901234567`. */
  national: string
  /** ISO country code, used for reporting. */
  country: string | null
}

/**
 * Turns whatever the tenant sent into one canonical form.
 *
 * Normalizing at the edge matters for more than tidiness: idempotency,
 * per-recipient rate limits and on-net routing all compare numbers, and they
 * would silently disagree if `+998901234567` and `901234567` were stored as
 * different recipients.
 */
export function normalizePhoneNumber(input: string, region = DEFAULT_REGION): NormalizedNumber {
  const parsed = parsePhoneNumberFromString(input.trim(), region as never)

  if (!parsed || !parsed.isValid()) {
    throw new DomainException(
      ErrorCode.INVALID_NUMBER,
      'The recipient number is not a valid phone number',
      {
        status: 422,
        details: { recipient: input },
      }
    )
  }

  return {
    e164: parsed.number,
    national: parsed.nationalNumber.toString(),
    country: parsed.country ?? null,
  }
}

/**
 * Non throwing variant for places that must not fail a batch because of one
 * bad row, such as bulk imports.
 */
export function tryNormalizePhoneNumber(
  input: string,
  region = DEFAULT_REGION
): NormalizedNumber | null {
  try {
    return normalizePhoneNumber(input, region)
  } catch {
    return null
  }
}
