import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import connectionManager from '#realtime/connection_manager'
import RecipientAllowance from '#services/sms/recipient_allowance'
import { GatewayAssignment, GatewayStatus, SimState } from '#enums/gateway_status'
import { SmsStatus } from '#enums/sms_status'
import gatewayConfig from '#config/gateway'

type Client = QueryClientContract | TransactionClientContract

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
  /** The device's own rate across all its SIMs. Null: only the SIM paces. */
  gatewaySmsPerMinute: number | null
  smsBalance: number | null
  /** Successful sends over total attempts in the recent window, 0..1. */
  successRate: number
  lastUsedAt: DateTime | null

  /**
   * Whether the SIM can be reserved right now: its pacing window has passed
   * and it has room for another message in flight.
   */
  availableNow: boolean
  /**
   * When the pacing window ends. Null when the SIM is busy for a reason with
   * no known end, i.e. its in-flight slots are full.
   */
  availableAt: DateTime | null

  /** The SIM may already message this recipient today; it costs no allowance. */
  holdsRecipient: boolean
  /** Distinct recipients allowed per day. Null means no cap. */
  recipientLimit: number | null
  /** Distinct recipients already taken today. */
  recipientsUsed: number
}

export type SelectionCriteria = {
  tenantId: number
  /** Normalized E.164 recipient, used to prefer on-net routing. */
  recipient: string
  requestedOperatorId: number | null
  requestedGatewayId: number | null
  /** A SIM slot on the requested device. Only meaningful with a device. */
  requestedSlot?: number | null
  /** SIMs that already failed this message and must not be tried again. */
  excludeSimProfileIds: number[]
  /** The operator day the allowance is counted against. */
  usageDate: string
}

export type FillStrategy = 'sequential' | 'spread'

/**
 * What the dispatcher should do with a message.
 */
export type RoutePlan =
  /** Try to reserve these, in order. */
  | { kind: 'try'; candidates: RouteCandidate[] }
  /** The right SIM exists but is busy; come back then. */
  | { kind: 'wait'; until: DateTime }
  /** SIMs exist, but every one has used its allowance and none holds this number. */
  | { kind: 'exhausted' }
  /** No SIM could carry this message at all. */
  | { kind: 'unavailable' }

/**
 * Wait applied when the SIM to wait for is busy with no known end.
 */
const UNKNOWN_WAIT_SECONDS = 5

/**
 * Chooses which SIM should carry a message.
 *
 * Candidates are filtered in SQL, where the database can use its indexes, and
 * decided in TypeScript, where the rules stay readable and unit testable. The
 * fleet is tens of devices, not millions of rows, so pulling the shortlist out
 * costs nothing and buys a lot of clarity.
 */
export default class SimProfileSelector {
  /**
   * Every SIM that could carry this message, busy or not.
   *
   * Busy SIMs are deliberately included. The sequential strategy has to know
   * that the SIM it should use is merely paced, so it can wait for it instead
   * of opening a slot on the next one.
   */
  static async candidates(
    criteria: SelectionCriteria,
    client: Client = db.connection()
  ): Promise<RouteCandidate[]> {
    /**
     * Only devices whose socket lives in this process can be reached from
     * here. Asking the database for gateways attached elsewhere would produce
     * routes we cannot actually deliver on.
     */
    const reachable = connectionManager.onlineGatewayIds()
    if (reachable.length === 0) return []

    const rows = await this.query(criteria, reachable, client)
    return rows.map((row) => this.toCandidate(row))
  }

  /**
   * Decides where a message goes. Pure, so every routing rule can be tested
   * without a database or a device.
   *
   * The order of concerns:
   *
   * 1. A SIM already allowed to message this number today costs nothing, so it
   *    always wins, and the message waits for it if it is momentarily busy.
   * 2. Otherwise only SIMs with allowance left are considered. If there are
   *    none the message is parked until a device joins or the day rolls over.
   * 3. Among those, the fill strategy picks: `sequential` takes the first SIM
   *    in fleet order and waits for it; `spread` takes whichever is free.
   */
  static plan(
    candidates: RouteCandidate[],
    recipient: string,
    strategy: FillStrategy,
    now: DateTime = DateTime.now()
  ): RoutePlan {
    if (candidates.length === 0) return { kind: 'unavailable' }

    const holders = candidates.filter((candidate) => candidate.holdsRecipient)

    if (holders.length > 0) {
      const ordered = [...holders].sort((a, b) => this.compare(a, b, recipient))
      return this.tryOrWait(ordered, now)
    }

    const withAllowance = candidates.filter((candidate) => this.hasAllowance(candidate))
    if (withAllowance.length === 0) return { kind: 'exhausted' }

    if (strategy === 'sequential') {
      /**
       * Only the first SIM in fleet order is a valid target. Falling through
       * to the next one because the first is busy for a few seconds would fill
       * every SIM in parallel, which is the spread strategy by another name.
       */
      const [target] = [...withAllowance].sort((a, b) => this.compareFillOrder(a, b))
      return this.tryOrWait([target], now)
    }

    const ordered = [...withAllowance].sort((a, b) => this.compare(a, b, recipient))
    return this.tryOrWait(ordered, now)
  }

  static hasAllowance(candidate: RouteCandidate): boolean {
    return candidate.recipientLimit === null || candidate.recipientsUsed < candidate.recipientLimit
  }

  /**
   * Reserves a SIM by pushing its next availability forward, and the device's
   * too when the device has a rate of its own.
   *
   * The conditional update decides which worker gets the route. It also takes
   * the SIM's row lock and keeps it until the transaction ends, which is what
   * `RecipientAllowance.claim` relies on to count and insert without a race:
   * that dependency is intentional, keep the claim in the same transaction.
   */
  static async reserve(
    candidate: RouteCandidate,
    client: Client = db.connection()
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

    if ((result.rowCount ?? 0) !== 1) return false
    if (candidate.gatewaySmsPerMinute === null) return true

    /**
     * The other SIM of the same phone may have taken the device's window a
     * moment ago. Then this SIM was free but the phone is not; give the SIM
     * back (it was free, so clearing it restores it exactly).
     */
    const deviceSpacing = 60 / Math.max(1, candidate.gatewaySmsPerMinute)
    const device = await client.rawQuery(
      `UPDATE gateways
          SET next_available_at = now() + (? * interval '1 second')
        WHERE id = ?
          AND (next_available_at IS NULL OR next_available_at <= now())`,
      [deviceSpacing, candidate.gatewayId]
    )

    if ((device.rowCount ?? 0) === 1) return true

    await client
      .from('sim_profiles')
      .where('id', candidate.simProfileId)
      .update({ next_available_at: null, updated_at: new Date() })

    return false
  }

  /**
   * Undoes a reservation that did not turn into a send, so neither the SIM nor
   * the device is idle for a whole pacing window.
   *
   * Pass the transaction when undoing inside the one that reserved: a separate
   * connection would wait on the row lock that transaction is holding.
   */
  static async release(candidate: RouteCandidate, client: Client = db.connection()): Promise<void> {
    await client
      .from('sim_profiles')
      .where('id', candidate.simProfileId)
      .update({ next_available_at: null, updated_at: new Date() })

    if (candidate.gatewaySmsPerMinute !== null) {
      await client
        .from('gateways')
        .where('id', candidate.gatewayId)
        .update({ next_available_at: null })
    }
  }

  private static tryOrWait(ordered: RouteCandidate[], now: DateTime): RoutePlan {
    const free = ordered.filter((candidate) => candidate.availableNow)
    if (free.length > 0) return { kind: 'try', candidates: free }

    const known = ordered
      .map((candidate) => candidate.availableAt)
      .filter((at): at is DateTime => at !== null)
      .sort((a, b) => a.toMillis() - b.toMillis())

    const until = known[0] ?? now.plus({ seconds: UNKNOWN_WAIT_SECONDS })
    return { kind: 'wait', until: until < now ? now : until }
  }

  private static async query(criteria: SelectionCriteria, reachable: number[], client: Client) {
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
        'sp.next_available_at',
        'g.id as gateway_id',
        'g.uid as gateway_uid',
        'g.priority as gateway_priority',
        'g.max_in_flight',
        'g.sms_per_minute as gateway_sms_per_minute',
        'g.next_available_at as gateway_next_available_at',
        'o.code as operator_code',
        'o.phone_prefixes'
      )
      .select(
        RecipientAllowance.effectiveLimitSql(gatewayConfig.routing.defaultDailyRecipientLimit)
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
      .select(
        db.raw(`(sp.next_available_at IS NULL OR sp.next_available_at <= now()) as paced_free`)
      )
      .select(
        db.raw(
          `(g.sms_per_minute IS NULL
              OR g.next_available_at IS NULL
              OR g.next_available_at <= now()) as device_paced_free`
        )
      )
      /**
       * The allowance ledger: how many numbers this SIM has taken today, and
       * whether this one is among them. At most a few dozen rows per SIM.
       */
      .select(
        db.raw(
          `(SELECT count(*) FROM sim_daily_recipients r
             WHERE r.sim_profile_id = sp.id AND r.usage_date = ?) as recipients_used`,
          [criteria.usageDate]
        )
      )
      .select(
        db.raw(
          `EXISTS (SELECT 1 FROM sim_daily_recipients r
                    WHERE r.sim_profile_id = sp.id
                      AND r.usage_date = ?
                      AND r.recipient_normalized = ?) as holds_recipient`,
          [criteria.usageDate, criteria.recipient]
        )
      )
      .whereIn('g.id', reachable)
      .where('g.is_active', true)
      .where('g.status', GatewayStatus.ONLINE)
      .where('g.last_seen_at', '>', offlineCutoff)
      .where('sp.is_active', true)
      .where('sp.state', SimState.READY)
      /**
       * Automatic routing uses the shared pool only. A tenant's own phone is
       * used when a message names it, and only for that tenant; an unassigned
       * device carries nothing at all.
       */
      .where((builder) => {
        if (criteria.requestedGatewayId) {
          builder
            .where('g.assignment', GatewayAssignment.POOL)
            .orWhere((own) =>
              own
                .where('g.assignment', GatewayAssignment.TENANT)
                .where('g.tenant_id', criteria.tenantId)
            )
        } else {
          builder.where('g.assignment', GatewayAssignment.POOL)
        }
      })
      /**
       * Unknown balance is not empty balance: refusing to use every SIM whose
       * operator we cannot query over USSD would park most of the fleet.
       */
      .where((builder) => builder.whereNull('sp.sms_balance').orWhere('sp.sms_balance', '>', 0))
      /**
       * The message quota resets on the operator's day, like the recipient
       * allowance, not on the database server's.
       */
      .where((builder) =>
        builder
          .whereNull('sp.daily_quota')
          .orWhereRaw('sp.sent_today < sp.daily_quota')
          .orWhereRaw('sp.counter_date IS DISTINCT FROM ?::date', [criteria.usageDate])
      )

    if (criteria.requestedGatewayId) {
      query.where('g.id', criteria.requestedGatewayId)
    }

    if (criteria.requestedOperatorId) {
      query.where('sp.operator_id', criteria.requestedOperatorId)
    }

    if (criteria.requestedSlot !== undefined && criteria.requestedSlot !== null) {
      query.where('sp.slot', criteria.requestedSlot)
    }

    if (criteria.excludeSimProfileIds.length > 0) {
      query.whereNotIn('sp.id', criteria.excludeSimProfileIds)
    }

    return query.limit(50)
  }

  private static toCandidate(row: Record<string, any>): RouteCandidate {
    const inFlight = Number(row.in_flight ?? 0)
    const maxInFlight = Number(row.max_in_flight)
    const simFree = Boolean(row.paced_free)
    const deviceFree = Boolean(row.device_paced_free)
    const pacedFree = simFree && deviceFree
    const slotsFree = inFlight < maxInFlight

    /**
     * Free again when both windows have passed: the later of the two.
     */
    let availableAt: DateTime | null
    if (!slotsFree) {
      availableAt = null
    } else if (pacedFree) {
      availableAt = DateTime.now()
    } else {
      const windows = [
        simFree ? null : row.next_available_at,
        deviceFree ? null : row.gateway_next_available_at,
      ]
        .filter(Boolean)
        .map((value) => DateTime.fromJSDate(new Date(value)))
        .sort((a, b) => b.toMillis() - a.toMillis())

      availableAt = windows[0] ?? DateTime.now()
    }

    return {
      simProfileId: Number(row.sim_profile_id),
      simProfileUid: row.sim_profile_uid,
      slot: Number(row.slot),
      gatewayId: Number(row.gateway_id),
      gatewayUid: row.gateway_uid,
      gatewayPriority: Number(row.gateway_priority),
      maxInFlight,
      inFlight,
      operatorId: row.operator_id === null ? null : Number(row.operator_id),
      operatorCode: row.operator_code ?? null,
      phonePrefixes: Array.isArray(row.phone_prefixes) ? row.phone_prefixes : [],
      smsPerMinute: Number(row.sms_per_minute),
      gatewaySmsPerMinute:
        row.gateway_sms_per_minute === null ? null : Number(row.gateway_sms_per_minute),
      smsBalance: row.sms_balance === null ? null : Number(row.sms_balance),
      successRate: row.success_rate === null ? 1 : Number(row.success_rate),
      lastUsedAt: row.last_used_at ? DateTime.fromJSDate(new Date(row.last_used_at)) : null,
      availableNow: pacedFree && slotsFree,
      availableAt,
      holdsRecipient: Boolean(row.holds_recipient),
      recipientLimit: row.recipient_limit === null ? null : Number(row.recipient_limit),
      recipientsUsed: Number(row.recipients_used ?? 0),
    }
  }

  /**
   * Fleet order: the order the sequential strategy fills SIMs in. An explicit
   * priority first, then the order devices joined, then slot. Stable on
   * purpose, so an operator can predict which SIM fills next.
   */
  static compareFillOrder(a: RouteCandidate, b: RouteCandidate): number {
    if (a.gatewayPriority !== b.gatewayPriority) return a.gatewayPriority - b.gatewayPriority
    if (a.gatewayId !== b.gatewayId) return a.gatewayId - b.gatewayId
    return a.slot - b.slot
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
