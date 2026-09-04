import { type ErrorCode, isPermanentError } from '#enums/error_code'

/**
 * Backoff between attempts, in seconds. Growing rather than fixed, so a device
 * fleet that is briefly saturated is not hammered by the same message every
 * two seconds.
 */
const BACKOFF_SECONDS = [5, 30, 120]

/**
 * Ceiling for waits that are not about a failed attempt but about there being
 * no capacity right now. Capacity usually returns within seconds.
 */
const NO_CAPACITY_BACKOFF_SECONDS = 5

export type RetryDecision =
  { retry: true; delaySeconds: number } | { retry: false; reason: 'permanent' | 'exhausted' }

/**
 * Decides what happens after a failed attempt.
 *
 * The distinction that matters is permanent versus transient. Retrying an
 * invalid number three times costs three device slots and produces the same
 * answer, while retrying a momentarily unreachable device is exactly right.
 */
export function decideRetry(options: {
  errorCode: ErrorCode | string | null
  attempts: number
  maxAttempts: number
}): RetryDecision {
  if (isPermanentError(options.errorCode)) {
    return { retry: false, reason: 'permanent' }
  }

  if (options.attempts >= options.maxAttempts) {
    return { retry: false, reason: 'exhausted' }
  }

  /**
   * `attempts` is the count already made, so the first failure (attempts === 1)
   * waits the first interval.
   */
  const index = Math.min(options.attempts - 1, BACKOFF_SECONDS.length - 1)
  const base = BACKOFF_SECONDS[Math.max(0, index)]

  return { retry: true, delaySeconds: withJitter(base) }
}

/**
 * Delay before looking for a route again when every device was busy.
 */
export function noCapacityDelaySeconds(): number {
  return withJitter(NO_CAPACITY_BACKOFF_SECONDS)
}

/**
 * Spreads retries out. Without jitter, a batch of messages that failed together
 * because one gateway dropped would all come back at the same instant and fail
 * together again.
 */
function withJitter(seconds: number): number {
  const spread = seconds * 0.25
  return Math.max(1, Math.round(seconds - spread + Math.random() * spread * 2))
}
