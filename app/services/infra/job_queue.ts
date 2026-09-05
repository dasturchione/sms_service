import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import jobsConfig from '#config/jobs'
import { type JobQueueName, JobStatus } from '#enums/job'

export type EnqueueOptions = {
  /**
   * Delay before the job becomes eligible. Absent means immediately.
   */
  delaySeconds?: number

  /**
   * Makes an enqueue idempotent: a second job with the same key on the same
   * queue is dropped rather than producing a second delivery. Callers that can
   * be replayed (a retried request, a re-processed device result) should always
   * pass one.
   */
  dedupeKey?: string

  maxAttempts?: number

  /**
   * Joins the caller's transaction. Without it a job could become visible to a
   * worker before, or instead of, the state change that justified it.
   */
  client?: TransactionClientContract
}

export type ClaimedJob = {
  id: string
  queue: string
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
}

/**
 * Postgres unique violation, raised here when a dedupe key is already queued.
 */
const PG_UNIQUE_VIOLATION = '23505'

/**
 * A durable, at-least-once work queue on top of one Postgres table.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED`, so several workers drain the same
 * queue without coordinating and without a broker. A worker that dies mid-job
 * leaves its lease to expire rather than stranding the work.
 *
 * At-least-once is the honest guarantee: a handler that completes its side
 * effect and then loses the process will run again. Handlers must tolerate it.
 */
export default class JobQueue {
  /**
   * Adds work. Returns false when a job with the same dedupe key is already
   * waiting, which is a success from the caller's point of view: the delivery
   * it wanted is already scheduled.
   */
  static async enqueue(
    queue: JobQueueName,
    payload: Record<string, unknown>,
    options: EnqueueOptions = {}
  ): Promise<boolean> {
    const now = DateTime.now()
    const runAt = now.plus({ seconds: options.delaySeconds ?? 0 })

    const row = {
      queue,
      payload: JSON.stringify(payload),
      status: JobStatus.PENDING,
      attempts: 0,
      max_attempts: options.maxAttempts ?? 5,
      run_at: runAt.toSQL(),
      dedupe_key: options.dedupeKey ?? null,
      created_at: now.toSQL(),
      updated_at: now.toSQL(),
    }

    const client = options.client ?? db.connection()

    try {
      await client.table('jobs').insert(row)
      return true
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        logger.debug({ queue, dedupeKey: options.dedupeKey }, 'job already queued')
        return false
      }
      throw error
    }
  }

  /**
   * Takes up to `limit` eligible jobs and leases them to `workerId`.
   *
   * The claim is a single statement on purpose: selecting and then updating in
   * two round trips leaves a window in which another worker sees the same rows.
   */
  static async claim(
    queue: JobQueueName,
    workerId: string,
    limit = jobsConfig.batchSize
  ): Promise<ClaimedJob[]> {
    const result = await db.rawQuery(
      `UPDATE jobs
          SET status = ?,
              attempts = attempts + 1,
              locked_by = ?,
              lease_expires_at = now() + (? * interval '1 second'),
              updated_at = now()
        WHERE id IN (
          SELECT id FROM jobs
           WHERE queue = ?
             AND status = ?
             AND run_at <= now()
           ORDER BY run_at ASC, id ASC
           LIMIT ?
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, queue, payload, attempts, max_attempts`,
      [JobStatus.RUNNING, workerId, jobsConfig.leaseSeconds, queue, JobStatus.PENDING, limit]
    )

    return (result.rows as Record<string, any>[]).map((row) => ({
      id: String(row.id),
      queue: row.queue,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }))
  }

  /**
   * The job is finished. Deleting rather than marking it keeps the table the
   * size of the backlog instead of the size of history; what the job did is
   * recorded wherever that belongs, not here.
   */
  static async complete(jobId: string): Promise<void> {
    await db.from('jobs').where('id', jobId).delete()
  }

  /**
   * The job threw. It goes back on the queue with backoff until its attempts
   * run out, then stays as `failed` so a human can find it.
   */
  static async fail(job: ClaimedJob, error: unknown): Promise<{ retrying: boolean }> {
    const message = error instanceof Error ? error.message : String(error)
    const lastError = message.slice(0, 1000)

    if (job.attempts >= job.maxAttempts) {
      await db.from('jobs').where('id', job.id).update({
        status: JobStatus.FAILED,
        locked_by: null,
        lease_expires_at: null,
        last_error: lastError,
        updated_at: DateTime.now().toSQL(),
      })

      logger.error({ jobId: job.id, queue: job.queue, err: message }, 'job failed permanently')
      return { retrying: false }
    }

    const delay = this.backoffFor(job.attempts)

    await db.rawQuery(
      `UPDATE jobs
          SET status = ?,
              locked_by = NULL,
              lease_expires_at = NULL,
              last_error = ?,
              run_at = now() + (? * interval '1 second'),
              updated_at = now()
        WHERE id = ?`,
      [JobStatus.PENDING, lastError, delay, job.id]
    )

    logger.warn(
      { jobId: job.id, queue: job.queue, attempt: job.attempts, retryInSeconds: delay },
      'job failed, retry scheduled'
    )
    return { retrying: true }
  }

  /**
   * Frees jobs whose worker went away. Without this a job held by a process
   * that was killed mid-run would never be picked up again.
   */
  static async reclaimExpiredLeases(): Promise<number> {
    const result = await db.rawQuery(
      `UPDATE jobs
          SET status = ?,
              locked_by = NULL,
              lease_expires_at = NULL,
              updated_at = now()
        WHERE status = ?
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= now()`,
      [JobStatus.PENDING, JobStatus.RUNNING]
    )

    const reclaimed = result.rowCount ?? 0
    if (reclaimed > 0) {
      logger.warn({ reclaimed }, 'reclaimed jobs whose lease expired')
    }
    return reclaimed
  }

  /**
   * Backlog depth per queue, for the metrics endpoint and for alerting.
   */
  static async depth(): Promise<Record<string, { pending: number; failed: number }>> {
    const rows = await db
      .from('jobs')
      .select('queue', 'status')
      .count('* as total')
      .groupBy('queue', 'status')

    const depth: Record<string, { pending: number; failed: number }> = {}

    for (const row of rows as Record<string, any>[]) {
      depth[row.queue] ??= { pending: 0, failed: 0 }
      if (row.status === JobStatus.FAILED) {
        depth[row.queue].failed = Number(row.total)
      } else {
        depth[row.queue].pending += Number(row.total)
      }
    }

    return depth
  }

  private static backoffFor(attempt: number): number {
    const table = jobsConfig.backoffSeconds
    const base = table[Math.min(attempt - 1, table.length - 1)] ?? table[table.length - 1]

    /**
     * Jitter, so a receiver that failed a hundred deliveries at once does not
     * get all hundred retries back in the same second.
     */
    return Math.round(base * (0.8 + Math.random() * 0.4))
  }

  private static isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === PG_UNIQUE_VIOLATION
    )
  }
}
