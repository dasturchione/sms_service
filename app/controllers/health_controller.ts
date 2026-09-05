import type { HttpContext } from '@adonisjs/core/http'
import MonitoringService from '#services/infra/monitoring_service'
import { ForbiddenException } from '#exceptions/domain_exception'
import env from '#start/env'

/**
 * Operational endpoints: what a load balancer, an uptime check and a metrics
 * scraper ask for.
 *
 * None of them are tenant scoped and none of them authenticate as a tenant, so
 * they sit outside the API surface entirely.
 */
export default class HealthController {
  /**
   * Liveness. Deliberately touches nothing: its only job is to say the process
   * is running and able to answer. A liveness probe that queried the database
   * would have the orchestrator restart every instance during a database
   * failover, turning an outage into a longer one.
   */
  async live() {
    return { status: 'ok' }
  }

  /**
   * Readiness. Answers 503 when a dependency is missing, so a load balancer
   * stops sending traffic an instance cannot serve.
   */
  async ready({ response }: HttpContext) {
    const result = await MonitoringService.readiness()

    response.status(result.ready ? 200 : 503)

    return { status: result.ready ? 'ready' : 'degraded', checks: result.checks }
  }

  /**
   * Prometheus metrics.
   *
   * Protected by a bearer token when `METRICS_TOKEN` is set. The numbers here
   * describe the whole platform — fleet size, traffic volume, failure rate —
   * which is not something to publish to anyone who finds the URL.
   */
  async metrics({ request, response }: HttpContext) {
    const expected = env.get('METRICS_TOKEN')

    if (expected && request.header('authorization') !== `Bearer ${expected}`) {
      throw new ForbiddenException('This endpoint requires the metrics token')
    }

    response.header('content-type', 'text/plain; version=0.0.4; charset=utf-8')

    return response.send(await MonitoringService.prometheus())
  }
}
