import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import connectionManager from '#realtime/connection_manager'
import { GatewayStatus, SimState } from '#enums/gateway_status'
import { SmsStatus } from '#enums/sms_status'
import gatewayConfig from '#config/gateway'

/**
 * A candidate route, flattened from the gateway / SIM / operator join so the
 * scoring below is plain data rather than a chain of lazy relations.
 */
export type RouteCandidate = {
  simProfileId: number
  simProfileUid: string
  slot: number
  gatewayId: number
  gatewayUid: string
  gatewayPriority: number
  maxInFlight: number
  inFlight: number
  operatorId: number | null
  operatorCode: string | null
  phonePrefixes: string[]
  smsPerMinute: number
  smsBalance: number | null
  /** Successful sends over total attempts in the recent window, 0..1. */
  successRate: number
  lastUsedAt: DateTime | null
}

export type SelectionCriteria = {
  tenantId: number
  /** Normalized E.164 recipient, used to prefer on-net routing. */
  recipient: string
  requestedOperatorId: number | null
  requestedGatewayId: number | null
  /** SIMs that already failed this message and must not be tried again. */
  excludeSimProfileIds: number[]
}

/**
 * Chooses which SIM should carry a message.
 *
 * Candidates are filtered in SQL, where the database can use its indexes, and
 * scored in TypeScript, where the rules stay readable and unit testable. The
 * fleet is tens of devices, not millions of rows, so pulling the shortlist out
 * costs nothing and buys a lot of clarity.
 */
export default class SimProfileSelector {
  /**
   * Returns candidates in preference order. The caller walks the list, because
   * the best candidate may lose a reservation race to another worker and the
   * second best is then the right answer.
   */
  static async candidates(
    criteria: SelectionCriteria,
    client: QueryClientContract | TransactionClientContract = db.connection()
  ): Promise<RouteCandidate[]> {
    /**
     * Only devices whose socket lives in this process can be reached from
     * here. Asking the database for gateways attached elsewhere would produce
     * routes we cannot actually deliver on.
     */
    const reachable = connectionManager.onlineGatewayIds()
    if (reachable.length === 0) return []

    const rows = await this.query(criteria, reachable, client)

    return rows
      .map((row) => this.toCandidate(row))
      .filter((candidate) => candidate.inFlight < candidate.maxInFlight)
      .sort((a, b) => this.compare(a, b, criteria.recipient))
  }

  /**
   * Attempts to reserve a candidate by pushing its next availability forward.
   *
   * This conditional update is the concurrency control for the whole
   * dispatcher: exactly one worker can move a SIM's `next_available_at`, so
   * exactly one worker gets the route. No locks, no leader election.
   */
  static async reserve(
    candidate: RouteCandidate,
    client: QueryClientContract | TransactionClientContract = db.connection()
  ): Promise<boolean> {
    const spacingSeconds = 60 / Math.max(1, candidate.smsPerMinute)

    const result = await client.rawQuery(
      `UPDATE sim_profiles
          SET next_available_at = now() + (? * interval '1 second'),
              updated_at = now()
        WHERE id = ?
          AND (next_available_at IS NULL OR next_available_at <= now())`,
      [spacingSeconds, candidate.simProfileId]
    )

    return (result.rowCount ?? 0) === 1
  }

  /**
   * Releases a reservation when the message could not actually be handed over,
   * so the slot is not wasted for a whole pacing window.
   */
  static async release(simProfileId: number): Promise<void> {
    await db
      .from('sim_profiles')
      .where('id', simProfileId)
      .update({ next_available_at: null, updated_at: new Date() })
  }

  private static async query(
    criteria: SelectionCriteria,
    reachable: number[],
    client: QueryClientContract | TransactionClientContract
  ) {
    const offlineCutoff = DateTime.now()
      .minus({ seconds: gatewayConfig.presence.offlineAfterSeconds })
      .toSQL()!

    const query = client
      .from('sim_profiles as sp')
      .join('gateways as g', 'g.id', 'sp.gateway_id')
      .leftJoin('operators as o', 'o.id', 'sp.operator_id')
      .select(
        'sp.id as sim_profile_id',
        'sp.uid as sim_profile_uid',
        'sp.slot',
        'sp.sms_per_minute',
        'sp.sms_balance',
        'sp.operator_id',
        'g.id as gateway_id',
        'g.uid as gateway_uid',
        'g.priority as gateway_priority',
        'g.max_in_flight',
        'o.code as operator_code',
        'o.phone_prefixes'
      )
      /**
       * In-flight count and recent success rate as correlated subqueries: one
       * round trip, and both are cheap thanks to the partial indexes.
       */
      .select(
        db.raw(
          `(SELECT count(*) FROM sms_messages m
             WHERE m.sim_profile_id = sp.id
               AND m.status IN (?, ?)) as in_flight`,
          [SmsStatus.ASSIGNED, SmsStatus.SENDING]
        )
      )
      .select(
        db.raw(
          `(SELECT max(a.started_at) FROM sms_attempts a
             WHERE a.sim_profile_id = sp.id) as last_used_at`
        )
      )
      .select(
        db.raw(
          `(SELECT coalesce(
                     avg(CASE WHEN a.status = ? THEN 1.0 ELSE 0.0 END),
                     1.0)
              FROM sms_attempts a
             WHERE a.sim_profile_id = sp.id
               AND a.started_at > now() - interval '15 minutes') as success_rate`,
          [SmsStatus.SENT]
        )
      )
      .whereIn('g.id', reachable)
      .where('g.is_active', true)
      .where('g.status', GatewayStatus.ONLINE)
      .where('g.last_seen_at', '>', offlineCutoff)
      .where('sp.is_active', true)
      .where('sp.state', SimState.READY)
      /**
       * A shared pool device serves everyone; a dedicated one serves only its
       * tenant.
       */
      .where((builder) =>
        builder.whereNull('g.tenant_id').orWhere('g.tenant_id', criteria.tenantId)
      )
      /**
       * Unknown balance is not empty balance: refusing to use every SIM whose
       * operator we cannot query over USSD would park most of the fleet.
       */
      .where((builder) => builder.whereNull('sp.sms_balance').orWhere('sp.sms_balance', '>', 0))
      .where((builder) =>
        builder
          .whereNull('sp.daily_quota')
          .orWhereRaw('sp.sent_today < sp.daily_quota')
          .orWhereRaw('sp.counter_date IS DISTINCT FROM current_date')
      )
      .where((builder) =>
        builder.whereNull('sp.next_available_at').orWhereRaw('sp.next_available_at <= now()')
      )

    if (criteria.requestedGatewayId) {
      query.where('g.id', criteria.requestedGatewayId)
    }

    if (criteria.requestedOperatorId) {
      query.where('sp.operator_id', criteria.requestedOperatorId)
    }

    if (criteria.excludeSimProfileIds.length > 0) {
      query.whereNotIn('sp.id', criteria.excludeSimProfileIds)
    }

    return query.limit(50)
  }

  private static toCandidate(row: Record<string, any>): RouteCandidate {
    return {
      simProfileId: Number(row.sim_profile_id),
      simProfileUid: row.sim_profile_uid,
      slot: Number(row.slot),
      gatewayId: Number(row.gateway_id),
      gatewayUid: row.gateway_uid,
      gatewayPriority: Number(row.gateway_priority),
      maxInFlight: Number(row.max_in_flight),
      inFlight: Number(row.in_flight ?? 0),
      operatorId: row.operator_id === null ? null : Number(row.operator_id),
      operatorCode: row.operator_code ?? null,
      phonePrefixes: Array.isArray(row.phone_prefixes) ? row.phone_prefixes : [],
      smsPerMinute: Number(row.sms_per_minute),
      smsBalance: row.sms_balance === null ? null : Number(row.sms_balance),
      successRate: row.success_rate === null ? 1 : Number(row.success_rate),
      lastUsedAt: row.last_used_at ? DateTime.fromJSDate(new Date(row.last_used_at)) : null,
    }
  }

  /**
   * Preference order, most significant first. Exposed for unit tests, which is
   * why it takes plain candidates rather than reading the database.
   */
  static compare(a: RouteCandidate, b: RouteCandidate, recipient: string): number {
    /**
     * An operator's explicit priority is an instruction, not a hint, so it
     * outranks every heuristic below it.
     */
    if (a.gatewayPriority !== b.gatewayPriority) return a.gatewayPriority - b.gatewayPriority

    /**
     * On-net messages are cheaper and usually more reliable.
     */
    const aOnNet = this.isOnNet(a, recipient)
    const bOnNet = this.isOnNet(b, recipient)
    if (aOnNet !== bOnNet) return aOnNet ? -1 : 1

    /**
     * Then avoid devices that have been failing: a phone with a flaky radio
     * should drain out of rotation on its own.
     */
    if (Math.abs(a.successRate - b.successRate) > 0.05) return b.successRate - a.successRate

    /**
     * Then spread load, then prefer the SIM with more headroom.
     */
    if (a.inFlight !== b.inFlight) return a.inFlight - b.inFlight

    const aBalance = a.smsBalance ?? Number.POSITIVE_INFINITY
    const bBalance = b.smsBalance ?? Number.POSITIVE_INFINITY
    if (aBalance !== bBalance) return bBalance - aBalance

    /**
     * Finally round-robin, so identical devices take turns.
     */
    const aUsed = a.lastUsedAt?.toMillis() ?? 0
    const bUsed = b.lastUsedAt?.toMillis() ?? 0
    return aUsed - bUsed
  }

  static isOnNet(candidate: RouteCandidate, recipient: string): boolean {
    if (candidate.phonePrefixes.length === 0) return false

    const national = recipient.replace(/^\+998/, '')
    return candidate.phonePrefixes.some((prefix) => national.startsWith(prefix))
  }
}
