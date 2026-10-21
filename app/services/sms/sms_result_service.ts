import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import SmsMessage from '#models/sms_message'
import SmsAttempt from '#models/sms_attempt'
import SmsService from '#services/sms/sms_service'
import WebhookService from '#services/webhooks/webhook_service'
import { decideRetry } from '#services/sms/retry_policy'
import RecipientAllowance from '#services/sms/recipient_allowance'
import { billingDate } from '#utils/billing_day'
import gatewayConfig from '#config/gateway'
import { ErrorCode } from '#enums/error_code'
import { SmsEvent } from '#enums/sms_event'
import { isTerminalSmsStatus, SmsAttemptStatus, SmsStatus } from '#enums/sms_status'
import { WebhookEvent } from '#enums/webhook_event'
import { ServerEvent, type SmsDeliveredPayload, type SmsResultPayload } from '#realtime/protocol'
import connectionManager from '#realtime/connection_manager'

/**
 * A message together with the reporting device's own attempt at it.
 */
type OwnedMessage = {
  message: SmsMessage
  /** The reporting device's latest attempt at this message. */
  attempt: SmsAttempt
  /** That attempt is the one currently holding the message. */
  isCurrent: boolean
}

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
      const owned = await this.lockOwnedMessage(gatewayId, jobId, trx)
      if (!owned?.isCurrent || owned.message.status !== SmsStatus.ASSIGNED) return

      const { message } = owned
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
   * The radio's verdict on a send: handed to the network, or failed.
   *
   * Usually from the device currently holding the message. It can also be a
   * late report about an earlier attempt, after the lease ran out and the
   * message moved on. A late success is not thrown away: the message really
   * did go out, and pretending otherwise is how a customer ends up with two
   * copies while the panel says something else.
   */
  static async recordResult(gatewayId: number, payload: SmsResultPayload): Promise<void> {
    await db.transaction(async (trx) => {
      const owned = await this.lockOwnedMessage(gatewayId, payload.jobId, trx)
      if (!owned) return

      if (payload.status === 'sent') {
        await this.ensureSent(owned, gatewayId, payload, trx)
        return
      }

      if (owned.isCurrent) {
        await this.applyFailure(owned.message, gatewayId, payload, trx)
      } else {
        await this.applyLateFailure(owned, gatewayId, payload, trx)
      }
    })
  }

  /**
   * The operator's status report: the message reached the handset, or it
   * never will.
   *
   * A delivery report is proof the message was sent, so it is accepted even
   * when the send result has not been applied yet (it was lost, or is still
   * on its way). Before this, a report that overtook its own send result was
   * silently dropped and the message sat at `sent` forever.
   */
  static async recordDelivered(gatewayId: number, payload: SmsDeliveredPayload): Promise<void> {
    await db.transaction(async (trx) => {
      const owned = await this.lockOwnedMessage(gatewayId, payload.jobId, trx)
      if (!owned) return

      const { message } = owned
      if (message.status === SmsStatus.DELIVERED) return

      const failed = payload.status === 'failed'
      if (
        failed &&
        message.status === SmsStatus.FAILED &&
        message.errorCode === ErrorCode.DELIVERY_FAILED
      ) {
        return
      }

      await this.ensureSent(owned, gatewayId, { jobId: payload.jobId, status: 'sent' }, trx)

      const statusCode = payload.statusCode ?? null

      if (failed) {
        message.merge({
          status: SmsStatus.FAILED,
          errorCode: ErrorCode.DELIVERY_FAILED,
          errorMessage:
            statusCode === null
              ? 'The operator reported that the message was not delivered'
              : `The operator reported that the message was not delivered (status ${statusCode})`,
          failedAt: DateTime.now(),
        })
        await message.useTransaction(trx).save()

        await SmsService.recordEvent(
          message,
          SmsEvent.DELIVERY_FAILED,
          { statusCode },
          gatewayId,
          trx
        )
        await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_FAILED, { client: trx })
        return
      }

      message.merge({
        status: SmsStatus.DELIVERED,
        deliveredAt: this.parseInstant(payload.deliveredAt) ?? DateTime.now(),
      })
      await message.useTransaction(trx).save()

      await SmsService.recordEvent(message, SmsEvent.DELIVERED, { statusCode }, gatewayId, trx)
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

  /**
   * Records that the reporting attempt put the message on the network.
   *
   * The one path for every kind of success: the current holder reporting,
   * a late report about an earlier attempt, and a delivery report that
   * arrives before its send result. Keeping them in one place is what keeps
   * the counters, the allowance and the webhooks consistent between them.
   */
  private static async ensureSent(
    owned: OwnedMessage,
    gatewayId: number,
    payload: SmsResultPayload,
    trx: TransactionClientContract
  ): Promise<void> {
    const { message, attempt } = owned

    /**
     * Already sent by some attempt. If this report is about a different
     * attempt, a second copy went out: rare, unavoidable once two devices
     * held the job, and worth recording rather than hiding.
     */
    if (this.wasSent(message)) {
      if (attempt && attempt.status !== SmsAttemptStatus.SENT) {
        await this.finishAttempt(attempt, trx, { status: SmsAttemptStatus.SENT })
        await this.countSend(attempt.simProfileId, message.recipientNormalized, attempt, trx)
        await SmsService.recordEvent(
          message,
          SmsEvent.SENT,
          { duplicate: true, attempt: attempt.attemptNo },
          gatewayId,
          trx
        )
        logger.warn({ smsUid: message.uid, gatewayId }, 'a second copy of a message was sent')
      }
      return
    }

    /**
     * A late success from an earlier attempt while a newer one is still in
     * flight elsewhere: call the newer one off before it sends a duplicate.
     */
    if (attempt && !owned.isCurrent) {
      await this.supersedeCurrentAttempt(message, attempt, trx)
    }

    if (attempt) {
      message.simProfileId = attempt.simProfileId
      message.assignedAt = attempt.startedAt
      await this.finishAttempt(attempt, trx, { status: SmsAttemptStatus.SENT })
    }

    message.merge({
      status: SmsStatus.SENT,
      sentAt: this.parseInstant(payload.sentAt) ?? message.sentAt ?? DateTime.now(),
      providerMessageId: payload.providerMessageId ?? message.providerMessageId ?? null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      failedAt: null,
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

    await SmsService.recordEvent(
      message,
      SmsEvent.SENT,
      {
        providerMessageId: payload.providerMessageId ?? null,
        ...(owned.isCurrent ? {} : { late: true }),
      },
      gatewayId,
      trx
    )

    await this.countSend(message.simProfileId, message.recipientNormalized, attempt, trx)
    await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_SENT, { client: trx })
  }

  /**
   * Whether the message is already known to have left a SIM. A failed
   * delivery counts: the network took the message, it just did not arrive.
   * Without that, a resent `sent` result (its acknowledgement lost to a
   * dropped link) would turn a `DELIVERY_FAILED` message back into `sent`.
   */
  private static wasSent(message: SmsMessage): boolean {
    return (
      message.status === SmsStatus.SENT ||
      message.status === SmsStatus.DELIVERED ||
      (message.status === SmsStatus.FAILED && message.errorCode === ErrorCode.DELIVERY_FAILED)
    )
  }

  /**
   * Counts one message that actually left a SIM: the daily message quota and
   * the distinct-recipient ledger. The ledger day is the day the slot was
   * claimed, i.e. when the attempt started, so a result arriving just after
   * midnight still lands on yesterday's slot.
   */
  private static async countSend(
    simProfileId: number | null,
    recipient: string,
    attempt: SmsAttempt | null,
    trx: TransactionClientContract
  ): Promise<void> {
    if (!simProfileId) return

    await this.countAgainstDailyQuota(simProfileId, trx)
    await RecipientAllowance.recordSent(
      trx,
      simProfileId,
      recipient,
      billingDate(attempt?.startedAt ?? DateTime.now())
    )
  }

  /**
   * Calls off the attempt currently holding a message, because an earlier
   * attempt turned out to have sent it after all.
   *
   * The device is told to drop the job. That is best effort: if it already
   * handed it to the radio, its own result will come back and be recorded as
   * a duplicate. Its allowance slot is returned unless something was
   * actually sent through it.
   */
  private static async supersedeCurrentAttempt(
    message: SmsMessage,
    reporting: SmsAttempt,
    trx: TransactionClientContract
  ): Promise<void> {
    if (message.status !== SmsStatus.ASSIGNED && message.status !== SmsStatus.SENDING) return

    const current = await SmsAttempt.query({ client: trx })
      .where('sms_message_id', String(message.id))
      .where('attempt_no', message.attempts)
      .first()

    if (!current || current.id === reporting.id) return

    await this.finishAttempt(current, trx, {
      status: SmsAttemptStatus.FAILED,
      errorCode: ErrorCode.SUPERSEDED,
      errorMessage: `Attempt ${reporting.attemptNo} was confirmed sent after this one started`,
    })

    if (current.simProfileId) {
      await RecipientAllowance.release(trx, {
        simProfileId: current.simProfileId,
        recipient: message.recipientNormalized,
        usageDate: billingDate(current.startedAt),
        exceptMessageId: message.id,
      })
    }

    if (current.gatewayId) {
      connectionManager.get(current.gatewayId)?.send(ServerEvent.SMS_CANCEL, { jobId: message.uid })
    }

    await SmsService.recordEvent(
      message,
      SmsEvent.SUPERSEDED,
      { cancelledAttempt: current.attemptNo, confirmedAttempt: reporting.attemptNo },
      current.gatewayId,
      trx
    )
  }

  private static async applyFailure(
    message: SmsMessage,
    gatewayId: number,
    payload: SmsResultPayload,
    trx: TransactionClientContract
  ): Promise<void> {
    const errorCode = this.normalizeErrorCode(payload.errorCode)
    const errorMessage = this.describeFailure(payload)

    await this.updateCurrentAttempt(message, trx, {
      status: SmsAttemptStatus.FAILED,
      errorCode,
      errorMessage,
    })

    await SmsService.recordEvent(
      message,
      SmsEvent.FAILED,
      {
        errorCode,
        errorMessage,
        platformResult: payload.platformResult ?? null,
        radioErrorCode: payload.radioErrorCode ?? null,
      },
      gatewayId,
      trx
    )

    await this.retryOrFail(message, errorCode, errorMessage, trx)
  }

  /**
   * A failure reported about an attempt that no longer holds the message.
   * The attempt's own record is completed, so its history is accurate, but
   * the message is governed by whichever attempt holds it now.
   */
  private static async applyLateFailure(
    owned: OwnedMessage,
    gatewayId: number,
    payload: SmsResultPayload,
    trx: TransactionClientContract
  ): Promise<void> {
    const { message, attempt } = owned
    if (!attempt || attempt.status === SmsAttemptStatus.SENT) return
    if (attempt.status === SmsAttemptStatus.FAILED) return

    const errorCode = this.normalizeErrorCode(payload.errorCode)
    const errorMessage = this.describeFailure(payload)

    await this.finishAttempt(attempt, trx, {
      status: SmsAttemptStatus.FAILED,
      errorCode,
      errorMessage,
    })

    await SmsService.recordEvent(
      message,
      SmsEvent.FAILED,
      {
        errorCode,
        errorMessage,
        late: true,
        attempt: attempt.attemptNo,
        platformResult: payload.platformResult ?? null,
        radioErrorCode: payload.radioErrorCode ?? null,
      },
      gatewayId,
      trx
    )
  }

  /**
   * The device's own words, with the platform's codes attached when they add
   * something. Support reads this; the error code is for machines.
   */
  private static describeFailure(payload: SmsResultPayload): string | null {
    const base = payload.errorMessage?.slice(0, 400) ?? null
    const codes: string[] = []
    if (payload.platformResult !== undefined && payload.platformResult !== null) {
      codes.push(`result ${payload.platformResult}`)
    }
    if (payload.radioErrorCode !== undefined && payload.radioErrorCode !== null) {
      codes.push(`radio ${payload.radioErrorCode}`)
    }

    if (codes.length === 0) return base
    return `${base ?? 'Send failed'} [${codes.join(', ')}]`
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
    /**
     * Device failures and expired leases both end up here, before the SIM is
     * forgotten, which makes this the one place an unused allowance slot is
     * handed back. Whether the message is retried or failed for good, a slot
     * that never carried a message to the network should not stay spent.
     */
    if (message.simProfileId && message.assignedAt) {
      await RecipientAllowance.release(trx, {
        simProfileId: message.simProfileId,
        recipient: message.recipientNormalized,
        usageDate: billingDate(message.assignedAt),
        exceptMessageId: message.id,
      })
    }

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
   * Loads a message and proves the reporting device took part in it.
   *
   * Ownership is decided by attempts, not by which SIM holds the message
   * right now: a device reporting on an attempt it really made is telling the
   * truth even after the message moved on. A device with no attempt at all
   * is refused, so a compromised phone still cannot speak about another
   * device's traffic.
   */
  private static async lockOwnedMessage(
    gatewayId: number,
    jobId: string,
    trx: TransactionClientContract
  ): Promise<OwnedMessage | null> {
    const message = await SmsMessage.query({ client: trx }).where('uid', jobId).forUpdate().first()

    if (!message) {
      logger.warn({ gatewayId, jobId }, 'gateway reported on an unknown job')
      return null
    }

    const attempt = await SmsAttempt.query({ client: trx })
      .where('sms_message_id', String(message.id))
      .where('gateway_id', gatewayId)
      .orderBy('attempt_no', 'desc')
      .first()

    if (!attempt) {
      logger.warn({ gatewayId, jobId }, 'gateway reported on a job it never held')
      return null
    }

    const isCurrent =
      attempt.attemptNo === message.attempts &&
      message.simProfileId === attempt.simProfileId &&
      (message.status === SmsStatus.ASSIGNED || message.status === SmsStatus.SENDING)

    return { message, attempt, isCurrent }
  }

  private static async finishAttempt(
    attempt: SmsAttempt,
    trx: TransactionClientContract,
    values: {
      status: SmsAttemptStatus
      errorCode?: ErrorCode | null
      errorMessage?: string | null
    }
  ): Promise<void> {
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
   *
   * The date is the operator's, passed in, not the database's `current_date`,
   * which follows the server's UTC clock and would reset the counter at five
   * in the morning in Tashkent.
   */
  private static async countAgainstDailyQuota(
    simProfileId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    const today = billingDate()

    await trx.rawQuery(
      `UPDATE sim_profiles
          SET sent_today = CASE
                WHEN counter_date IS DISTINCT FROM ?::date THEN 1
                ELSE sent_today + 1
              END,
              counter_date = ?::date,
              updated_at = now()
        WHERE id = ?`,
      [today, today, simProfileId]
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
