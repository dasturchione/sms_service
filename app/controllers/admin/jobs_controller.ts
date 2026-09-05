import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import JobQueue from '#services/infra/job_queue'
import { NotFoundException } from '#exceptions/domain_exception'
import { JobStatus } from '#enums/job'
import { listJobsValidator } from '#validators/admin'

/**
 * The background queue, from the outside.
 *
 * A failed job is the one kind of platform failure nothing else surfaces: a
 * webhook that exhausted its attempts is not an error the tenant sees, not a
 * message that failed, and not something the metrics endpoint explains. It just
 * sits in the table. This is where someone finds it and decides what to do.
 */
export default class AdminJobsController {
  async index({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(listJobsValidator)

    const query = db
      .from('jobs')
      .orderBy('id', 'desc')
      .limit(filters.limit ?? 50)

    if (filters.status) query.where('status', filters.status)
    if (filters.queue) query.where('queue', filters.queue)

    const rows = await query

    return serialize.withoutWrapping({
      data: (rows as Record<string, any>[]).map((row) => ({
        id: String(row.id),
        queue: row.queue,
        status: row.status,
        attempts: Number(row.attempts),
        maxAttempts: Number(row.max_attempts),
        lastError: row.last_error,
        runAt: row.run_at,
        createdAt: row.created_at,

        /**
         * The payload is included because for a webhook it says which endpoint
         * and which event, which is the whole question being asked.
         */
        payload: row.payload,
      })),
      meta: { depth: await JobQueue.depth() },
    })
  }

  /**
   * Puts a failed job back on the queue.
   *
   * The attempt counter is reset rather than continued: a job is retried by
   * hand because the reason it failed has been fixed, and starting from the
   * last backoff step would make the first attempt an hour away.
   */
  async retry({ params, response }: HttpContext) {
    const affected = await db
      .from('jobs')
      .where('id', params.id)
      .where('status', JobStatus.FAILED)
      .update({
        status: JobStatus.PENDING,
        attempts: 0,
        locked_by: null,
        lease_expires_at: null,
        run_at: DateTime.now().toSQL(),
        updated_at: DateTime.now().toSQL(),
      })

    /**
     * Nothing updated means it was not failed — already retried by someone
     * else, or still running. Either way there is nothing here to retry.
     */
    if (Number(affected) === 0) throw new NotFoundException('Failed job', String(params.id))

    return response.noContent()
  }

  /**
   * Drops a failed job for good. For deliveries that will never be wanted: an
   * endpoint that has been gone for a week, an event about a tenant that no
   * longer exists.
   */
  async destroy({ params, response }: HttpContext) {
    const affected = await db
      .from('jobs')
      .where('id', params.id)
      .where('status', JobStatus.FAILED)
      .delete()

    if (Number(affected) === 0) throw new NotFoundException('Failed job', String(params.id))

    return response.noContent()
  }
}
