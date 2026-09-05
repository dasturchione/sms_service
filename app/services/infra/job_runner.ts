import logger from '@adonisjs/core/services/logger'
import JobQueue, { type ClaimedJob } from '#services/infra/job_queue'
import jobsConfig from '#config/jobs'
import gatewayConfig from '#config/gateway'
import type { JobQueueName } from '#enums/job'

export type JobHandler = (payload: Record<string, unknown>, job: ClaimedJob) => Promise<void>

/**
 * Drains the job queues on this process.
 *
 * Deliberately plain: one timer, one claim per queue per pass, handlers run
 * concurrently within a batch. There is no leader election and no coordination
 * between processes because there does not need to be — `SKIP LOCKED` already
 * guarantees two workers never take the same row.
 */
export default class JobRunner {
  private handlers = new Map<JobQueueName, JobHandler>()
  private timer: NodeJS.Timeout | null = null
  private running = false
  private stopped = false

  /**
   * The identity written into a job's lease. Sharing the gateway node id keeps
   * a stuck job traceable to a process in the same terms as a stuck message.
   */
  private readonly workerId = gatewayConfig.nodeId

  register(queue: JobQueueName, handler: JobHandler): this {
    this.handlers.set(queue, handler)
    return this
  }

  start(): void {
    if (this.timer) return

    this.stopped = false
    this.timer = setInterval(() => this.wake(), jobsConfig.pollIntervalMs)
    this.timer.unref()

    logger.info({ queues: [...this.handlers.keys()] }, 'job runner started')
    this.wake()
  }

  /**
   * Requests a pass. Cheap and safe to call often: overlapping passes are
   * collapsed, since two passes claiming at once would only compete for the
   * same rows.
   */
  wake(): void {
    if (this.stopped || this.running) return

    this.running = true
    this.drain()
      .catch((error) => logger.error({ err: error }, 'job pass failed'))
      .finally(() => {
        this.running = false
      })
  }

  private async drain(): Promise<void> {
    /**
     * Leases are reclaimed before claiming, so a job abandoned by a dead
     * worker is picked up by this pass rather than the one after it.
     */
    await JobQueue.reclaimExpiredLeases()

    for (const [queue, handler] of this.handlers) {
      if (this.stopped) return

      const jobs = await JobQueue.claim(queue, this.workerId)
      if (jobs.length === 0) continue

      await Promise.all(jobs.map((job) => this.run(job, handler)))
    }
  }

  private async run(job: ClaimedJob, handler: JobHandler): Promise<void> {
    try {
      await handler(job.payload ?? {}, job)
      await JobQueue.complete(job.id)
    } catch (error) {
      /**
       * A handler that throws is a normal outcome, not an incident: a webhook
       * receiver being down is exactly what the retry schedule is for.
       */
      await JobQueue.fail(job, error).catch((failure) =>
        logger.error({ err: failure, jobId: job.id }, 'could not record a job failure')
      )
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    logger.info('job runner stopped')
  }
}
