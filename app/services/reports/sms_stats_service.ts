import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

/**
 * Grains the rollup maintains. A null dimension means "all", which is what
 * lets one table answer a platform wide question and a per SIM one without
 * either query having to know about the other.
 *
 * The dimension columns are integers, so the nulls below are cast: an untyped
 * `NULL` inside an INSERT ... SELECT is inferred as text and refused.
 */
type Grain = {
  name: string
  tenant: string
  sim: string
  operator: string
  /** Rows a grain is not about, e.g. unassigned messages for the SIM grain. */
  having?: string
}

const GRAINS: Grain[] = [
  { name: 'platform', tenant: 'NULL::int', sim: 'NULL::int', operator: 'NULL::int' },
  { name: 'tenant', tenant: 'm.tenant_id', sim: 'NULL::int', operator: 'NULL::int' },
  {
    name: 'sim',
    tenant: 'NULL::int',
    sim: 'm.sim_profile_id',
    operator: 'COALESCE(sp.operator_id, m.requested_operator_id)',
    having: 'm.sim_profile_id IS NOT NULL',
  },
  {
    name: 'operator',
    tenant: 'NULL::int',
    sim: 'NULL::int',
    operator: 'COALESCE(sp.operator_id, m.requested_operator_id)',
    having: 'COALESCE(sp.operator_id, m.requested_operator_id) IS NOT NULL',
  },
]

/**
 * Counters, written once here so the four grains cannot drift apart.
 *
 * `sent` counts delivered messages too: delivery is a later stage of the same
 * success, and a success rate that fell when an operator started returning
 * delivery reports would be nonsense.
 */
const AGGREGATES = `
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE m.status IN ('sent', 'delivered')) AS sent,
  COUNT(*) FILTER (WHERE m.status = 'delivered') AS delivered,
  COUNT(*) FILTER (WHERE m.status IN ('failed', 'expired')) AS failed,
  COUNT(*) FILTER (WHERE m.status IN ('created', 'queued', 'assigned', 'sending')) AS pending,
  COALESCE(SUM(m.segments), 0) AS segments,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (m.sent_at - m.queued_at)) * 1000)
      FILTER (WHERE m.sent_at IS NOT NULL AND m.queued_at IS NOT NULL)
  ) AS avg_send_ms
`

/**
 * Maintains `sms_daily_stats`.
 *
 * Reports read from here rather than from `sms_messages`, which stops being
 * viable somewhere past a few million rows. The rollup is a recompute, not an
 * increment: running it twice for the same day produces the same numbers, so
 * it is safe to run on several instances, safe to re-run after a bad deploy,
 * and cannot slowly drift away from the messages it summarises.
 */
export default class SmsStatsService {
  /**
   * Recomputes one day across every grain.
   */
  static async rollup(date: DateTime): Promise<void> {
    const day = date.toISODate()!

    for (const grain of GRAINS) {
      await db.rawQuery(
        `INSERT INTO sms_daily_stats (
           date, tenant_id, sim_profile_id, operator_id,
           total, sent, delivered, failed, pending, segments, avg_send_ms,
           created_at, updated_at
         )
         SELECT
           ?::date,
           ${grain.tenant},
           ${grain.sim},
           ${grain.operator},
           ${AGGREGATES},
           now(),
           now()
           FROM sms_messages m
           LEFT JOIN sim_profiles sp ON sp.id = m.sim_profile_id
          WHERE m.created_at >= ?::date
            AND m.created_at < (?::date + interval '1 day')
            ${grain.having ? `AND ${grain.having}` : ''}
          GROUP BY 2, 3, 4
         ON CONFLICT (
           date,
           COALESCE(tenant_id, 0),
           COALESCE(sim_profile_id, 0),
           COALESCE(operator_id, 0)
         )
         DO UPDATE SET
           total = EXCLUDED.total,
           sent = EXCLUDED.sent,
           delivered = EXCLUDED.delivered,
           failed = EXCLUDED.failed,
           pending = EXCLUDED.pending,
           segments = EXCLUDED.segments,
           avg_send_ms = EXCLUDED.avg_send_ms,
           updated_at = now()`,
        [day, day, day]
      )
    }
  }

  /**
   * What the scheduler runs.
   *
   * Today is recomputed because it is still moving, and yesterday because a
   * message created just before midnight can settle just after it — and
   * because a run that was missed while the process was down has to be able to
   * catch up on its own.
   */
  static async rollupRecent(): Promise<void> {
    const today = DateTime.now()

    try {
      await this.rollup(today)
      await this.rollup(today.minus({ days: 1 }))
    } catch (error) {
      logger.error({ err: error }, 'daily stats rollup failed')
    }
  }
}
