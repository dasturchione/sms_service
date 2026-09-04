/**
 * GSM 03.38 basic character set. Anything outside it (and outside the
 * extension table below) forces the whole message into UCS-2, which more than
 * halves the characters that fit in a segment.
 */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

/**
 * Characters that exist in GSM-7 but occupy two septets each.
 */
const GSM7_EXTENDED = '^{}\[~]|€'

const GSM7_CHARS = new Set(GSM7_BASIC)
const GSM7_EXTENDED_CHARS = new Set(GSM7_EXTENDED)

export type MessageEncoding = 'gsm7' | 'ucs2'

export type EncodedMessage = {
  encoding: MessageEncoding
  /** Billable parts. Operators charge per segment, not per message. */
  segments: number
  /** Septets for GSM-7, UTF-16 code units for UCS-2. */
  length: number
  /** Characters still available in the current segment count. */
  remaining: number
}

const LIMITS = {
  gsm7: { single: 160, multi: 153 },
  ucs2: { single: 70, multi: 67 },
} as const

function gsm7Length(text: string): number | null {
  let length = 0
  for (const char of text) {
    if (GSM7_CHARS.has(char)) {
      length += 1
    } else if (GSM7_EXTENDED_CHARS.has(char)) {
      length += 2
    } else {
      return null
    }
  }
  return length
}

/**
 * Works out how a body will actually travel over the air.
 *
 * This runs before a message is accepted so a tenant learns the segment count
 * up front, and so an oversized body is rejected rather than silently costing
 * eight parts.
 */
export function encodeMessage(text: string): EncodedMessage {
  const septets = gsm7Length(text)

  if (septets !== null) {
    return buildResult('gsm7', septets)
  }

  /**
   * UCS-2 counts UTF-16 code units, so an emoji outside the BMP counts twice.
   * Array.from would count it once and undercount the segments.
   */
  return buildResult('ucs2', text.length)
}

function buildResult(encoding: MessageEncoding, length: number): EncodedMessage {
  const limits = LIMITS[encoding]

  if (length === 0) {
    return { encoding, segments: 1, length: 0, remaining: limits.single }
  }

  if (length <= limits.single) {
    return { encoding, segments: 1, length, remaining: limits.single - length }
  }

  const segments = Math.ceil(length / limits.multi)
  return {
    encoding,
    segments,
    length,
    remaining: segments * limits.multi - length,
  }
}
