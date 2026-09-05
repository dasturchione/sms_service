import logger from '@adonisjs/core/services/logger'
import SmsStatsService from '#services/reports/sms_stats_service'
import AlertService from '#services/infra/alert_service'

/**
 * How often the daily rollup is recomputed. Reports read today live, so this
 * interval decides how stale *yesterday* may be, not how stale today is — five
 * minutes is generous for that and cheap to run.
 */
const ROLLUP_INTERVAL_MS = 5 * 60 * 1000

/**
 * How often balances are checked against tenant thresholds. Alerts are
 * de-duplicated per day, so a short interval costs a query, not a flood.
 */
const BALANCE_INTERVAL_MS = 5 * 60 * 1000

/**
 * Work that happens on a clock rather than in response to anything.
 *
 * Deliberately not jobs on the queue: a recurring task has no payload and no
 * producer, so putting it there would mean inventing a scheduler that enqueues
 * it — a second mechanism to get wrong. Both tasks here are idempotent, so
 * several instances running them is harmless.
 */
export default class PeriodicTasks {
  private timers: NodeJS.Timeout[] = []

  start(): void {
    this.every(ROLLUP_INTERVAL_MS, 'stats rollup', () => SmsStatsService.rollupRecent())
    this.every(BALANCE_INTERVAL_MS, 'balance sweep', () => AlertService.sweepLowBalances())
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer)
    this.timers = []
  }

  private every(intervalMs: number, name: string, task: () => Promise<unknown>): void {
    const run = () => {
      task().catch((error) => logger.error({ err: error, task: name }, 'periodic task failed'))
    }

    const timer = setInterval(run, intervalMs)

    /**
     * Unreferenced so a pending tick cannot hold the process open during a
     * shutdown.
     */
    timer.unref()
    this.timers.push(timer)

    /**
     * Run once at boot as well. After a deploy the rollup may be minutes
     * behind, and waiting a full interval to notice would be a choice.
     */
    run()
  }
}
