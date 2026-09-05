import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import SmsMessage from '#models/sms_message'
import SmsAttempt from '#models/sms_attempt'
import SimProfile from '#models/sim_profile'
import SmsService from '#services/sms/sms_service'
import WebhookService from '#services/webhooks/webhook_service'
import { decideRetry } from '#services/sms/retry_policy'
import gatewayConfig from '#config/gateway'
import { ErrorCode } from '#enums/error_code'
import { SmsEvent } from '#enums/sms_event'
import { isTerminalSmsStatus, SmsAttemptStatus, SmsStatus } from '#enums/sms_status'
import { WebhookEvent } from '#enums/webhook_event'
import type { SmsDeliveredPayload, SmsResultPayload } from '#realtime/protocol'

/**
 * Applies what devices report back.
 *
 * Every entry point here is idempotent and ownership checked. Devices operate
 * over flaky mobile links and resend anything they were not acknowledged for,
 * so a duplicate result is the normal case, not an attack. Ownership is
 * verified because a compromised phone must not be able to mark another
 * device's traffic as delivered.
 */
export default class SmsResultService {
  /**
   * The device confirms it holds the job. The lease is extended from the short
   * acknowledgement window to the full send window.
   */
  static async acknowledge(gatewayId: number, jobId: string): Promise<void> {
    await db.transaction(async (trx) => {
      const message = await this.lockOwnedMessage(gatewayId, jobId, trx)
      if (!message || message.status !== SmsStatus.ASSIGNED) return

      message.merge({
        status: SmsStatus.SENDING,
        leaseExpiresAt: DateTime.now().plus({ seconds: gatewayConfig.dispatch.leaseSeconds }),
      })
      await message.useTransaction(trx).save()

      await this.updateCurrentAttempt(message, trx, { status: SmsAttemptStatus.SENDING })
      await SmsService.recordEvent(message, SmsEvent.ACKED, null, gatewayId, trx)
    })
  }

  /**
   * Terminal report from the device: the message was handed to the radio, or
   * it failed.
   */
  static async recordResult(gatewayId: number, payload: SmsResultPayload): Promise<void> {
    await db.transaction(async (trx) => {
      const message = await this.lockOwnedMessage(gatewayId, payload.jobId, trx)
      if (!message) return

      /**
       * A resend of a result we already applied. Accepting it again would
       * corrupt counters and could resurrect a failed message.
       */
      if (isTerminalSmsStatus(message.status) || message.status === SmsStatus.SENT) {
        return
      }

      if (payload.status === 'sent') {
        await this.applySuccess(message, gatewayId, payload, trx)
      } else {
        await this.applyFailure(message, gatewayId, payload, trx)
      }
    })
  }

  /**
   * Optional delivery report. Only a message we already believe was sent can
   * become delivered.
   */
  static async recordDelivered(gatewayId: number, payload: SmsDeliveredPayload): Promise<void> {
    await db.transaction(async (trx) => {
      const message = await this.lockOwnedMessage(gatewayId, payload.jobId, trx)
      if (!message || message.status !== SmsStatus.SENT) return

      message.merge({
        status: SmsStatus.DELIVERED,
        deliveredAt: this.parseInstant(payload.deliveredAt) ?? DateTime.now(),
      })
      await message.useTransaction(trx).save()

      await SmsService.recordEvent(message, SmsEvent.DELIVERED, null, gatewayId, trx)
      await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_DELIVERED, { client: trx })
    })
  }

  /**
   * Reclaims messages whose device went quiet.
   *
   * This is what makes delivery at-least-once rather than best effort: a phone
   * that loses power between receiving a job and reporting on it would
   * otherwise strand that message forever.
   */
  static async sweepExpiredLeases(limit = 100): Promise<number> {
    const rows = await db
      .from('sms_messages')
      .select('id')
      .whereIn('status', [SmsStatus.ASSIGNED, SmsStatus.SENDING])
      .whereNotNull('lease_expires_at')
      .whereRaw('lease_expires_at <= now()')
      .limit(limit)

    let reclaimed = 0

    for (const row of rows) {
      await db.transaction(async (trx) => {
        const message = await SmsMessage.query({ client: trx })
          .where('id', String(row.id))
          .forUpdate()
          .first()

        if (!message || !message.leaseExpiresAt) return
        if (message.leaseExpiresAt.toMillis() > Date.now()) return
        if (isTerminalSmsStatus(message.status)) return

        await this.updateCurrentAttempt(message, trx, {
          status: SmsAttemptStatus.TIMED_OUT,
          errorCode: ErrorCode.LEASE_EXPIRED,
          errorMessage: 'The device did not report a result within the lease window',
        })

        await SmsService.recordEvent(message, SmsEvent.LEASE_EXPIRED, null, null, trx)
        await this.retryOrFail(message, ErrorCode.LEASE_EXPIRED, 'Lease expired', trx)
        reclaimed++
      })
    }

    if (reclaimed > 0) {
      logger.warn({ reclaimed }, 'reclaimed messages whose lease expired')
    }

    return reclaimed
  }

  /**
   * Fails messages whose deadline passed while they were still waiting.
   */
  static async sweepExpiredMessages(limit = 200): Promise<number> {
    const rows = await db
      .from('sms_messages')
      .select('id')
      .whereIn('status', [SmsStatus.CREATED, SmsStatus.QUEUED])
      .whereNotNull('expires_at')
      .whereRaw('expires_at <= now()')
      .limit(limit)

    let expired = 0

    for (const row of rows) {
      await db.transaction(async (trx) => {
        const message = await SmsMessage.query({ client: trx })
          .where('id', String(row.id))
          .forUpdate()
          .first()

        if (!message || isTerminalSmsStatus(message.status)) return

        message.merge({
          status: SmsStatus.EXPIRED,
          errorCode: ErrorCode.MESSAGE_EXPIRED,
          errorMessage: 'The message deadline passed before it could be sent',
          failedAt: DateTime.now(),
          dispatchBody: null,
        })
        await message.useTransaction(trx).save()

        await SmsService.recordEvent(message, SmsEvent.EXPIRED, null, null, trx)
        await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_EXPIRED, { client: trx })
        expired++
      })
    }

    return expired
  }

  private static async applySuccess(
    message: SmsMessage,
    gatewayId: number,
    payload: SmsResultPayload,
    trx: TransactionClientContract
  ): Promise<void> {
    const sentAt = this.parseInstant(payload.sentAt) ?? DateTime.now()

    message.merge({
      status: SmsStatus.SENT,
      sentAt,
      providerMessageId: payload.providerMessageId ?? null,
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      /**
       * The message left the platform, so the verbatim text has served its
       * purpose and is erased. What remains is whatever the tenant's retention
       * setting allowed us to keep.
       */
      dispatchBody: null,
    })
    await message.useTransaction(trx).save()

    await this.updateCurrentAttempt(message, trx, { status: SmsAttemptStatus.SENT })
    await SmsService.recordEvent(
      message,
      SmsEvent.SENT,
      { providerMessageId: payload.providerMessageId ?? null },
      gatewayId,
      trx
    )

    if (message.simProfileId) {
      await this.countAgainstDailyQuota(message.simProfileId, trx)
    }

    await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_SENT, { client: trx })
  }

  private static async applyFailure(
    message: SmsMessage,
    gatewayId: number,
    payload: SmsResultPayload,
    trx: TransactionClientContract
  ): Promise<void> {
    const errorCode = this.normalizeErrorCode(payload.errorCode)
    const errorMessage = payload.errorMessage?.slice(0, 500) ?? null

    await this.updateCurrentAttempt(message, trx, {
      status: SmsAttemptStatus.FAILED,
      errorCode,
      errorMessage,
    })

    await SmsService.recordEvent(
      message,
      SmsEvent.FAILED,
      { errorCode, errorMessage },
      gatewayId,
      trx
    )

    await this.retryOrFail(message, errorCode, errorMessage, trx)
  }

  /**
   * Decides whether a failed message goes back into the queue or stops here.
   */
  private static async retryOrFail(
    message: SmsMessage,
    errorCode: ErrorCode,
    errorMessage: string | null,
    trx: TransactionClientContract
  ): Promise<void> {
    const decision = decideRetry({
      errorCode,
      attempts: message.attempts,
      maxAttempts: message.maxAttempts,
    })

    if (decision.retry) {
      message.merge({
        status: SmsStatus.QUEUED,
        simProfileId: null,
        assignedAt: null,
        leaseExpiresAt: null,
        errorCode,
        errorMessage,
        nextAttemptAt: DateTime.now().plus({ seconds: decision.delaySeconds }),
      })
      await message.useTransaction(trx).save()

      await SmsService.recordEvent(
        message,
        SmsEvent.RETRY_SCHEDULED,
        { delaySeconds: decision.delaySeconds, attempt: message.attempts },
        null,
        trx
      )
      return
    }

    message.merge({
      status: SmsStatus.FAILED,
      /**
       * Exhausting the attempts is itself the reason, and it is more useful
       * than repeating the last transient error.
       */
      errorCode: decision.reason === 'exhausted' ? ErrorCode.ATTEMPTS_EXHAUSTED : errorCode,
      errorMessage,
      failedAt: DateTime.now(),
      leaseExpiresAt: null,
      dispatchBody: null,
    })
    await message.useTransaction(trx).save()

    /**
     * Only the final failure is published. A retry is an implementation
     * detail of ours, and telling a tenant about each one would make the
     * event stream read as several failures for one message.
     */
    await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_FAILED, { client: trx })
  }

  /**
   * Loads a message and proves the reporting device is the one holding it.
   *
   * The join through `sim_profiles` is the ownership check: a device can only
   * ever speak about messages assigned to one of its own SIM slots.
   */
  private static async lockOwnedMessage(
    gatewayId: number,
    jobId: string,
    trx: TransactionClientContract
  ): Promise<SmsMessage | null> {
    const message = await SmsMessage.query({ client: trx }).where('uid', jobId).forUpdate().first()

    if (!message) {
      logger.warn({ gatewayId, jobId }, 'gateway reported on an unknown job')
      return null
    }

    if (message.simProfileId === null) return null

    const owns = await SimProfile.query({ client: trx })
      .where('id', message.simProfileId)
      .where('gateway_id', gatewayId)
      .first()

    if (!owns) {
      logger.warn({ gatewayId, jobId }, 'gateway reported on a job it does not hold')
      return null
    }

    return message
  }

  private static async updateCurrentAttempt(
    message: SmsMessage,
    trx: TransactionClientContract,
    values: {
      status: SmsAttemptStatus
      errorCode?: ErrorCode | null
      errorMessage?: string | null
    }
  ): Promise<void> {
    const attempt = await SmsAttempt.query({ client: trx })
      .where('sms_message_id', String(message.id))
      .where('attempt_no', message.attempts)
      .first()

    if (!attempt) return

    const now = DateTime.now()
    attempt.merge({
      status: values.status,
      errorCode: values.errorCode ?? null,
      errorMessage: values.errorMessage ?? null,
      finishedAt: now,
      durationMs: Math.max(0, now.toMillis() - attempt.startedAt.toMillis()),
    })
    await attempt.useTransaction(trx).save()
  }

  /**
   * Advances the per SIM daily counter, resetting it when the date rolled over
   * since the last send.
   */
  private static async countAgainstDailyQuota(
    simProfileId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    await trx.rawQuery(
      `UPDATE sim_profiles
          SET sent_today = CASE
                WHEN counter_date IS DISTINCT FROM current_date THEN 1
                ELSE sent_today + 1
              END,
              counter_date = current_date,
              updated_at = now()
        WHERE id = ?`,
      [simProfileId]
    )
  }

  /**
   * Devices report codes from a fixed vocabulary, but a buggy or outdated
   * build could send anything. Unknown codes become a generic transient
   * failure rather than being stored as free text.
   */
  private static normalizeErrorCode(code: string | null | undefined): ErrorCode {
    if (!code) return ErrorCode.GENERIC_FAILURE

    const known = Object.values(ErrorCode).find((candidate) => candidate === code)
    return (known as ErrorCode) ?? ErrorCode.GENERIC_FAILURE
  }

  private static parseInstant(value: string | null | undefined): DateTime | null {
    if (!value) return null
    const parsed = DateTime.fromISO(value)
    return parsed.isValid ? parsed : null
  }
}
