import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import ReportsService from '#services/reports/reports_service'
import { reportRangeValidator } from '#validators/report'

/**
 * Default window when the caller does not ask for one. Thirty days is what a
 * dashboard shows and what an invoice covers.
 */
const DEFAULT_RANGE_DAYS = 30

export default class ReportsController {
  /**
   * One row per day. Days already closed come from the rollup, today is
   * computed live, and the caller cannot tell the difference — which is the
   * point.
   */
  async daily({ request, tenant, serialize }: HttpContext) {
    const { from, to } = await this.range(request)

    return serialize.withoutWrapping({
      data: await ReportsService.daily(tenant.id, from, to),
      meta: { from: from.toISODate(), to: to.toISODate() },
    })
  }

  async summary({ request, tenant, serialize }: HttpContext) {
    const { from, to } = await this.range(request)

    return serialize(await ReportsService.summary(tenant.id, from, to))
  }

  /**
   * Both bounds are snapped to whole days: a report is about days, and a range
   * that silently started at 14:03 would make two calls with the same dates
   * return different numbers.
   */
  private async range(request: HttpContext['request']) {
    const payload = await request.validateUsing(reportRangeValidator)

    const to = (payload.to ?? DateTime.now()).startOf('day')
    const from = payload.from
      ? payload.from.startOf('day')
      : to.minus({ days: DEFAULT_RANGE_DAYS - 1 })

    return { from, to }
  }
}
