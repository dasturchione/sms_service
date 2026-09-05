import db from '@adonisjs/lucid/services/db'
import type ApiClient from '#models/api_client'
import { RateLimitedException } from '#exceptions/domain_exception'

/**
 * Length of the sliding window. Per minute is what the limit on an API client
 * is expressed in, so the window has to match it exactly or the number in the
 * admin panel would mean something else than it says.
 */
const WINDOW_SECONDS = 60

/**
 * Per client send rate limiting.
 *
 * Counted straight off `sms_messages` rather than kept in a counter store.
 * That costs one indexed query per send — the `sms_messages_client_created_index`
 * exists for exactly this — and buys two things a counter cannot: it survives a
 * restart, and it is shared by every instance without any coordination. There
 * is no separate number that can drift away from the messages actually
 * accepted.
 *
 * The window slides rather than resetting on the minute, so a client cannot
 * send its whole allowance twice across a tick boundary.
 */
export default class RateLimiter {
  /**
   * Refuses the request when accepting `cost` messages would exceed the
   * client's allowance. Checks before writing anything, so a rejected batch
   * leaves nothing behind.
   */
  static async consume(apiClient: ApiClient | null, cost = 1): Promise<void> {
    if (!apiClient) return

    const limit = apiClient.rateLimitPerMin
    if (!limit || limit <= 0) return

    const used = await this.usage(apiClient.id)

    if (used + cost <= limit) return

    throw new RateLimitedException(await this.retryAfter(apiClient.id))
  }

  /**
   * Messages this client had accepted inside the window. Public because the
   * metrics endpoint reports it and tests assert on it.
   */
  static async usage(apiClientId: number): Promise<number> {
    const row = await db
      .from('sms_messages')
      .where('api_client_id', apiClientId)
      .whereRaw(`created_at > now() - interval '${WINDOW_SECONDS} seconds'`)
      .count('* as total')
      .first()

    return Number((row as { total?: string })?.total ?? 0)
  }

  /**
   * How long until the window has room again: the age of the oldest message
   * still inside it. Guessing a fixed number here would either send clients
   * back too early or make them wait longer than they have to.
   */
  private static async retryAfter(apiClientId: number): Promise<number> {
    const row = await db
      .from('sms_messages')
      .where('api_client_id', apiClientId)
      .whereRaw(`created_at > now() - interval '${WINDOW_SECONDS} seconds'`)
      .min('created_at as oldest')
      .first()

    const oldest = (row as { oldest?: Date })?.oldest
    if (!oldest) return WINDOW_SECONDS

    const elapsed = (Date.now() - new Date(oldest).getTime()) / 1000

    return Math.max(1, Math.ceil(WINDOW_SECONDS - elapsed))
  }
}
