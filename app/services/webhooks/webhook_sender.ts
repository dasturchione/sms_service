import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import WebhookEndpoint from '#models/webhook_endpoint'
import { signWebhook, SIGNATURE_HEADER } from '#services/webhooks/webhook_signature'
import type { WebhookDeliveryPayload } from '#services/webhooks/webhook_service'
import { AuditAction, ActorType } from '#enums/audit_action'
import AuditService from '#services/audit/audit_service'
import jobsConfig from '#config/jobs'

/**
 * Raised when a delivery should be retried. Carrying the reason as a plain
 * error keeps the job runner's contract simple: throwing means retry, and the
 * queue owns the schedule.
 */
class WebhookDeliveryError extends Error {}

/**
 * Performs one webhook delivery.
 *
 * This is the only place in the platform that makes an outbound request to a
 * tenant-controlled URL, which is why the timeout is not optional and why a
 * non-2xx answer is a failure rather than something to interpret. We do not
 * know what a receiver means by 500; we only know it did not accept.
 */
export default class WebhookSender {
  /**
   * The job handler. Its signature is what `JobRunner.register` expects.
   */
  static async handle(payload: Record<string, unknown>): Promise<void> {
    const delivery = payload as unknown as WebhookDeliveryPayload

    const endpoint = await WebhookEndpoint.query().where('uid', delivery.endpointUid).first()

    /**
     * The endpoint was deleted or switched off after the event was queued.
     * Dropping the delivery is correct: its owner has said they do not want it
     * any more, and retrying would be an argument with them.
     */
    if (!endpoint || !endpoint.isActive) {
      logger.debug(
        { endpointUid: delivery.endpointUid },
        'skipping delivery to an inactive endpoint'
      )
      return
    }

    const body = JSON.stringify({
      id: delivery.deliveryUid,
      event: delivery.event,
      occurredAt: delivery.occurredAt,
      data: delivery.data,
    })

    const timestamp = Math.floor(Date.now() / 1000)

    try {
      const response = await this.post(endpoint.url, body, {
        [SIGNATURE_HEADER]: signWebhook(endpoint.secret, body, timestamp),
        'content-type': 'application/json',
        'user-agent': 'sms-gateway-webhooks/1',
        'x-sms-event': delivery.event,
        'x-sms-delivery': delivery.deliveryUid,
      })

      if (response.ok) {
        await this.recordSuccess(endpoint)
        return
      }

      throw new WebhookDeliveryError(
        `Endpoint answered ${response.status} ${response.statusText}`.trim()
      )
    } catch (error) {
      await this.recordFailure(endpoint, error)
      throw error
    }
  }

  private static async post(
    url: string,
    body: string,
    headers: Record<string, string>
  ): Promise<Response> {
    /**
     * A receiver that accepts the connection and then never answers would
     * otherwise hold a worker for as long as it likes.
     */
    const abort = AbortSignal.timeout(jobsConfig.webhook.timeoutMs)

    try {
      return await fetch(url, { method: 'POST', headers, body, signal: abort, redirect: 'error' })
    } catch (error) {
      /**
       * DNS failures, refused connections, TLS errors and the timeout above
       * all land here and all mean the same thing to us.
       */
      const reason = error instanceof Error ? error.message : String(error)
      throw new WebhookDeliveryError(`Could not reach the endpoint: ${reason}`)
    }
  }

  /**
   * A success clears the failure streak. Counting consecutive failures rather
   * than total ones is what keeps a busy endpoint that had a bad afternoon
   * from being disabled a month later.
   */
  private static async recordSuccess(endpoint: WebhookEndpoint): Promise<void> {
    await db.from('webhook_endpoints').where('id', endpoint.id).update({
      failure_count: 0,
      last_success_at: DateTime.now().toSQL(),
      updated_at: DateTime.now().toSQL(),
    })
  }

  private static async recordFailure(endpoint: WebhookEndpoint, error: unknown): Promise<void> {
    const now = DateTime.now().toSQL()

    const [row] = await db
      .from('webhook_endpoints')
      .where('id', endpoint.id)
      .increment('failure_count', 1)
      .update({ last_failure_at: now, updated_at: now })
      .returning('failure_count')

    const failures = Number((row as { failure_count?: number })?.failure_count ?? 0)

    if (failures < jobsConfig.webhook.disableAfterFailures) return

    /**
     * The endpoint has been unreachable for long enough that it is fair to
     * assume nobody is coming. Disabling it stops the platform from spending
     * an unbounded amount of work on a URL that no longer exists.
     */
    await db.from('webhook_endpoints').where('id', endpoint.id).update({
      is_active: false,
      disabled_at: now,
      updated_at: now,
    })

    logger.error(
      { endpointUid: endpoint.uid, failures, err: error },
      'webhook endpoint disabled after repeated failures'
    )

    await AuditService.record({
      action: AuditAction.WEBHOOK_DISABLED,
      actor: { type: ActorType.SYSTEM },
      tenantId: endpoint.tenantId,
      resourceType: 'webhook_endpoint',
      resourceId: endpoint.uid,
      metadata: { failures, url: endpoint.url },
    })
  }
}
