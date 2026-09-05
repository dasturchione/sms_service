import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import ReportsService from '#services/reports/reports_service'
import TenantService from '#services/admin/tenant_service'
import { adminReportValidator } from '#validators/admin'

/**
 * Default window. Thirty days is what a dashboard shows and what an invoice
 * covers.
 */
const DEFAULT_RANGE_DAYS = 30

/**
 * Traffic over time, for the platform or for one tenant.
 *
 * The same service the tenant API uses, asked a wider question: passing no
 * tenant reads the platform grain the rollup already maintains, so the back
 * office costs no more than a tenant's own report.
 */
export default class AdminReportsController {
  async daily({ request, serialize }: HttpContext) {
    const { tenantId, from, to } = await this.scope(request)

    const [rows, summary] = await Promise.all([
      ReportsService.daily(tenantId, from, to),
      ReportsService.summary(tenantId, from, to),
    ])

    return serialize.withoutWrapping({
      data: rows,
      meta: { ...summary, tenantScoped: tenantId !== null },
    })
  }

  private async scope(request: HttpContext['request']) {
    const payload = await request.validateUsing(adminReportValidator)

    /**
     * Null means the whole platform. A tenant uid narrows it, and an unknown
     * uid is a 404 rather than a silent platform-wide answer — reading the
     * platform's totals while believing they are one tenant's would be worse
     * than an error.
     */
    const tenant = payload.tenant ? await TenantService.findByUid(payload.tenant) : null
    const tenantId = tenant?.id ?? null

    const to = (payload.to ?? DateTime.now()).startOf('day')
    const from = payload.from
      ? payload.from.startOf('day')
      : to.minus({ days: DEFAULT_RANGE_DAYS - 1 })

    return { tenantId, from, to }
  }
}
