import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import MonitoringService from '#services/infra/monitoring_service'
import { TenantStatus } from '#enums/tenant'

/**
 * The panel's landing page.
 *
 * One request rather than six, because a dashboard that fires a request per
 * tile is a dashboard that shows half the truth while it loads. Everything
 * here is a bounded count.
 */
export default class AdminOverviewController {
  async show({ serialize }: HttpContext) {
    const [snapshot, tenants, today] = await Promise.all([
      MonitoringService.snapshot(),
      this.tenantCounts(),
      this.todayTotals(),
    ])

    return serialize({
      queue: snapshot.queue,
      gateways: snapshot.gateways,
      jobs: snapshot.jobs,
      recent: snapshot.recent,
      tenants,
      today,
      /**
       * Stamped by the server so a panel left open overnight shows how stale
       * it is rather than implying it is live.
       */
      generatedAt: DateTime.now().toISO(),
    })
  }

  private async tenantCounts() {
    const rows = await db.from('tenants').select('status').count('* as total').groupBy('status')

    let total = 0
    let active = 0

    for (const row of rows as Record<string, any>[]) {
      const count = Number(row.total)
      total += count
      if (row.status === TenantStatus.ACTIVE) active = count
    }

    return { total, active }
  }

  private async todayTotals() {
    const row = await db
      .from('sms_messages')
      .whereRaw('created_at >= current_date')
      .select(
        db.raw('COUNT(*) AS total'),
        db.raw(`COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')) AS sent`),
        db.raw(`COUNT(*) FILTER (WHERE status IN ('failed', 'expired')) AS failed`),
        db.raw('COALESCE(SUM(segments), 0) AS segments')
      )
      .first()

    const values = row as Record<string, any>
    const sent = Number(values?.sent ?? 0)
    const failed = Number(values?.failed ?? 0)
    const settled = sent + failed

    return {
      total: Number(values?.total ?? 0),
      sent,
      failed,
      segments: Number(values?.segments ?? 0),

      /**
       * Measured against messages that have settled: counting the ones still
       * in flight as failures would make the rate look terrible at exactly the
       * moment someone is watching a campaign go out.
       */
      successRate: settled === 0 ? null : Math.round((sent / settled) * 10000) / 100,
    }
  }
}
