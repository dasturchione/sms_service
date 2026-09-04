import { createHash } from 'node:crypto'
import { BodyRetention, type TenantSettings } from '#enums/tenant'

/**
 * Message bodies routinely carry one time codes and personal data. How much of
 * one we are allowed to keep is a tenant decision, not a platform default, so
 * this is the single place that answers it.
 */
export function bodyForStorage(body: string, settings: Required<TenantSettings>): string | null {
  switch (settings.storeBody) {
    case BodyRetention.FULL:
      return body
    case BodyRetention.NONE:
      return null
    case BodyRetention.MASKED:
    default:
      return maskBody(body)
  }
}

/**
 * Keeps a message recognisable for support work while removing the part that
 * is actually sensitive: every run of digits is replaced.
 */
export function maskBody(body: string): string {
  return body.replace(/\d/g, '•')
}

/**
 * A stable fingerprint of the original body. Survives every retention mode,
 * so duplicate detection and idempotency checks keep working even when the
 * body itself was never stored.
 */
export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}
