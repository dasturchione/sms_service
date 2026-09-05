import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import DomainException from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'

export type DailyRow = {
  date: string
  total: number
  sent: number
  delivered: number
  failed: number
  pending: number
  segments: number
  avgSendMs: number | null
}

/**
 * Longest range a report may cover. A year of daily rows is 365 numbers, which
 * is a report; anything beyond it is an export, and exports belong somewhere
 * that can stream.
 */
const MAX_RANGE_DAYS = 366

/**
 * Reads the numbers a tenant is allowed to see about its own traffic.
 *
 * Closed days come from `sms_daily_stats`, which is what makes the endpoint
 * cheap at any history depth. Today is computed live instead, because a tenant
 * that just sent a message and sees a zero will reasonably conclude the
 * platform lost it — and the rollup only runs every few minutes.
 */
export default class ReportsService {
  /**
   * `tenantId` of null means the whole platform, which is the grain the rollup
   * already keeps and the one the back office asks for. A tenant can never
   * reach that path: its controller always passes its own id.
   */
  static async daily(tenantId: number | null, from: DateTime, to: DateTime): Promise<DailyRow[]> {
    this.assertRange(from, to)

    const today = DateTime.now().startOf('day')
    const rows: DailyRow[] = []

    const rolledUpTo = to < today ? to : today.minus({ days: 1 })

    if (from <= rolledUpTo) {
      const stored = await db
        .from('sms_daily_stats')
        .where((builder) =>
          tenantId === null ? builder.whereNull('tenant_id') : builder.where('tenant_id', tenantId)
        )
        .whereNull('sim_profile_id')
        .whereNull('operator_id')
        .where('date', '>=', from.toISODate()!)
        .where('date', '<=', rolledUpTo.toISODate()!)
        .orderBy('date', 'asc')

      for (const row of stored as Record<string, any>[]) {
        rows.push({
          date: DateTime.fromJSDate(new Date(row.date)).toISODate()!,
          total: Number(row.total),
          sent: Number(row.sent),
          delivered: Number(row.delivered),
          failed: Number(row.failed),
          pending: Number(row.pending),
          segments: Number(row.segments),
          avgSendMs: row.avg_send_ms === null ? null : Number(row.avg_send_ms),
        })
      }
    }

    if (to >= today) {
      rows.push(await this.liveDay(tenantId, today))
    }

    return rows
  }

  /**
   * Totals across the range, plus the one number an integrator actually asks
   * for: what share of what they sent got out.
   */
  static async summary(tenantId: number | null, from: DateTime, to: DateTime) {
    const rows = await this.daily(tenantId, from, to)

    const totals = rows.reduce(
      (sum, row) => ({
        total: sum.total + row.total,
        sent: sum.sent + row.sent,
        delivered: sum.delivered + row.delivered,
        failed: sum.failed + row.failed,
        pending: sum.pending + row.pending,
        segments: sum.segments + row.segments,
      }),
      { total: 0, sent: 0, delivered: 0, failed: 0, pending: 0, segments: 0 }
    )

    /**
     * Measured against messages that have settled. Counting the ones still in
     * flight as failures would make the rate look terrible at exactly the
     * moment a tenant is watching a campaign go out.
     */
    const settled = totals.sent + totals.failed

    return {
      from: from.toISODate(),
      to: to.toISODate(),
      ...totals,
      successRate: settled === 0 ? null : Math.round((totals.sent / settled) * 10000) / 100,
    }
  }

  /**
   * A day that the rollup has not closed yet, straight off `sms_messages`.
   */
  private static async liveDay(tenantId: number | null, day: DateTime): Promise<DailyRow> {
    const query = db.from('sms_messages')

    if (tenantId !== null) query.where('tenant_id', tenantId)

    const row = await query
      .where('created_at', '>=', day.toSQL()!)
      .where('created_at', '<', day.plus({ days: 1 }).toSQL()!)
      .select(
        db.raw('COUNT(*) AS total'),
        db.raw(`COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')) AS sent`),
        db.raw(`COUNT(*) FILTER (WHERE status = 'delivered') AS delivered`),
        db.raw(`COUNT(*) FILTER (WHERE status IN ('failed', 'expired')) AS failed`),
        db.raw(
          `COUNT(*) FILTER (WHERE status IN ('created', 'queued', 'assigned', 'sending')) AS pending`
        ),
        db.raw('COALESCE(SUM(segments), 0) AS segments'),
        db.raw(
          `ROUND(AVG(EXTRACT(EPOCH FROM (sent_at - queued_at)) * 1000)
             FILTER (WHERE sent_at IS NOT NULL AND queued_at IS NOT NULL)) AS avg_send_ms`
        )
      )
      .first()

    const values = row as Record<string, any>

    return {
      date: day.toISODate()!,
      total: Number(values?.total ?? 0),
      sent: Number(values?.sent ?? 0),
      delivered: Number(values?.delivered ?? 0),
      failed: Number(values?.failed ?? 0),
      pending: Number(values?.pending ?? 0),
      segments: Number(values?.segments ?? 0),
      avgSendMs: values?.avg_send_ms === null ? null : Number(values.avg_send_ms),
    }
  }

  private static assertRange(from: DateTime, to: DateTime): void {
    if (to < from) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, '`to` must not precede `from`', {
        status: 422,
      })
    }

    if (to.diff(from, 'days').days > MAX_RANGE_DAYS) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `A report may cover at most ${MAX_RANGE_DAYS} days`,
        { status: 422 }
      )
    }
  }
}
