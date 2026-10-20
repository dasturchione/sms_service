import { randomBytes } from 'node:crypto'

/**
 * Crockford base32: no I, L, O or U, so a code read off a phone screen or a
 * photo of a QR cannot be transcribed wrongly.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const LENGTH = 8

/**
 * A device's public code, e.g. `K7Q2M9XD`, shown as `K7Q2-M9XD`.
 *
 * Short enough to type, random enough (40 bits) that guessing an unclaimed
 * device's code is not a practical way to take it over.
 */
export function generateDeviceCode(): string {
  const bytes = randomBytes(LENGTH)
  let code = ''
  for (let index = 0; index < LENGTH; index++) {
    code += ALPHABET[bytes[index] % 32]
  }
  return code
}

/**
 * Accepts a code however a person typed it: lower case, with the dash or
 * spaces, and with the letters people confuse for digits.
 */
export function normalizeDeviceCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export function formatDeviceCode(code: string): string {
  return code.length === LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

export function isDeviceCode(input: string): boolean {
  const normalized = normalizeDeviceCode(input)
  return normalized.length === LENGTH && [...normalized].every((char) => ALPHABET.includes(char))
}
