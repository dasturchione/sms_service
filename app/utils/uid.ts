import { randomBytes } from 'node:crypto'

/**
 * Crockford base32 alphabet: no I, L, O or U, so a uid read off a support
 * ticket or a phone screen cannot be transcribed wrongly.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function encodeBase32(value: bigint, length: number): string {
  let out = ''
  let remaining = value
  for (let index = 0; index < length; index++) {
    out = ALPHABET[Number(remaining % 32n)] + out
    remaining /= 32n
  }
  return out
}

/**
 * Public identifier for a record, e.g. `sms_01J7Z9K4M2XQ8B3T5V6W7Y`.
 *
 * Internal auto increment ids are never exposed by the API: they leak volume
 * and let one tenant guess another tenant's record ids. The time prefix keeps
 * uids roughly ordered, which makes them pleasant to scan in logs.
 */
export function generateUid(prefix: string): string {
  const time = encodeBase32(BigInt(Date.now()), 10)
  const random = encodeBase32(BigInt('0x' + randomBytes(8).toString('hex')), 13)
  return `${prefix}_${time}${random}`
}

/**
 * Guards against a lookup by a uid that could not have been issued by us,
 * so a malformed value short circuits instead of hitting the database.
 */
export function isUid(value: string, prefix?: string): boolean {
  const pattern = prefix ? `^${prefix}_[0-9A-Z]{23}$` : `^[a-z_]+_[0-9A-Z]{23}$`
  return new RegExp(pattern).test(value)
}
