import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import WebhookEndpoint from '#models/webhook_endpoint'
import type SmsMessage from '#models/sms_message'
import JobQueue from '#services/infra/job_queue'
import { JobQueueName } from '#enums/job'
import { type WebhookEvent } from '#enums/webhook_event'
import jobsConfig from '#config/jobs'
import { generateUid } from '#utils/uid'

export type WebhookDeliveryPayload = {
  /**
   * Identifies this delivery. A receiver that stores it can drop the duplicate
   * that a retried delivery produces, which is the only way to turn our
   * at-least-once into their exactly-once.
   */
  deliveryUid: string
  endpointUid: string
  event: WebhookEvent
  occurredAt: string
  data: Record<string, unknown>
}

/**
 * Turns platform events into queued deliveries.
 *
 * Nothing here talks to the network. Publishing an event writes rows and
 * returns, so a slow or dead receiver can never slow down the code path that
 * produced the event — a device reporting a result must not wait on a tenant's
 * HTTP stack.
 */
export default class WebhookService {
  /**
   * Publishes a message level event to every endpoint subscribed to it.
   */
  static async publishSmsEvent(
    message: SmsMessage,
    event: WebhookEvent,
    options: { client?: TransactionClientContract } = {}
  ): Promise<void> {
    await this.publish(message.tenantId, event, this.smsPayload(message, event), {
      client: options.client,
      /**
       * One delivery per message per event, even if the code path that
       * produced it runs twice — which it will, since device results are
       * replayed on any flaky link.
       */
      dedupeSuffix: message.uid,
    })
  }

  /**
   * Publishes an arbitrary event. Never throws: an event that cannot be queued
   * must not fail the operation that caused it, and the queue is not the
   * system of record — `sms_events` is.
   */
  static async publish(
    tenantId: number,
    event: WebhookEvent,
    data: Record<string, unknown>,
    options: { client?: TransactionClientContract; dedupeSuffix?: string } = {}
  ): Promise<void> {
    try {
      const endpoints = await this.subscribersOf(tenantId, event)
      if (endpoints.length === 0) return

      const occurredAt = DateTime.now().toISO()!

      for (const endpoint of endpoints) {
        const payload: WebhookDeliveryPayload = {
          deliveryUid: generateUid('whd'),
          endpointUid: endpoint.uid,
          event,
          occurredAt,
          data,
        }

        await JobQueue.enqueue(JobQueueName.WEBHOOK_DELIVERY, payload, {
          client: options.client,
          maxAttempts: jobsConfig.webhook.maxAttempts,
          dedupeKey: options.dedupeSuffix
            ? `${event}:${options.dedupeSuffix}:${endpoint.uid}`
            : undefined,
        })
      }
    } catch (error) {
      logger.error({ err: error, tenantId, event }, 'could not queue webhook deliveries')
    }
  }

  /**
   * Active endpoints of a tenant that subscribe to this event. An endpoint
   * with an empty event list subscribes to everything, which is the shape most
   * integrations actually want.
   */
  private static async subscribersOf(
    tenantId: number,
    event: WebhookEvent
  ): Promise<WebhookEndpoint[]> {
    const endpoints = await WebhookEndpoint.query()
      .where('tenant_id', tenantId)
      .where('is_active', true)

    return endpoints.filter((endpoint) => endpoint.subscribesTo(event))
  }

  /**
   * The public shape of a message inside a webhook.
   *
   * Written out here rather than reused from the API transformer on purpose:
   * a webhook body is a contract with someone else's parser, and it must not
   * change just because a field was added to an API response.
   */
  private static smsPayload(message: SmsMessage, event: WebhookEvent): Record<string, unknown> {
    return {
      uid: message.uid,
      status: message.status,
      recipient: message.recipientNormalized,
      reference: message.reference,
      segments: message.segments,
      attempts: message.attempts,
      error:
        message.errorCode === null
          ? null
          : { code: message.errorCode, message: message.errorMessage },
      sentAt: message.sentAt?.toISO() ?? null,
      deliveredAt: message.deliveredAt?.toISO() ?? null,
      failedAt: message.failedAt?.toISO() ?? null,
      /**
       * Echoed back so a receiver can route on the event without inspecting
       * the status, which carries platform detail it should not depend on.
       */
      event,
    }
  }
}
