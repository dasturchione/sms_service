import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Header carrying the signature. Named after the platform rather than
 * something generic so it cannot collide with a proxy's own headers.
 */
export const SIGNATURE_HEADER = 'x-sms-signature'

/**
 * How far apart the signed timestamp and the receiver's clock may be before
 * the delivery is considered a replay. Documented here because a receiver has
 * to implement the same check for the signature to be worth anything.
 */
export const REPLAY_TOLERANCE_SECONDS = 300

/**
 * Signs a webhook body.
 *
 * The timestamp is inside the signed string, not merely next to it: signing
 * the body alone would let anyone who ever captured one delivery replay it
 * forever, and the receiver would have no way to tell.
 *
 * Format: `t=<unix seconds>,v1=<hex hmac sha256>`. The version prefix is what
 * makes rotating the scheme possible without breaking every receiver on the
 * same day.
 */
export function signWebhook(secret: string, body: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')

  return `t=${timestamp},v1=${digest}`
}

/**
 * Verifies a signature the way a receiver should. Used by the tests, and kept
 * next to the signing code so the two cannot drift apart.
 */
export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  now = Math.floor(Date.now() / 1000)
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const [key, ...rest] = piece.split('=')
      return [key.trim(), rest.join('=')]
    })
  )

  const timestamp = Number(parts.t)
  const provided = parts.v1

  if (!Number.isFinite(timestamp) || !provided) return false
  if (Math.abs(now - timestamp) > REPLAY_TOLERANCE_SECONDS) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')

  /**
   * `timingSafeEqual` throws on a length mismatch, which is itself a mismatch.
   */
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}
