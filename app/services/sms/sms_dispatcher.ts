import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import SmsMessage from '#models/sms_message'
import SmsAttempt from '#models/sms_attempt'
import SmsService from '#services/sms/sms_service'
import SimProfileSelector, { type RouteCandidate } from '#services/sms/sim_profile_selector'
import { noCapacityDelaySeconds } from '#services/sms/retry_policy'
import connectionManager from '#realtime/connection_manager'
import { ServerEvent, type SmsSendPayload } from '#realtime/protocol'
import gatewayConfig from '#config/gateway'
import { ErrorCode } from '#enums/error_code'
import { SmsEvent } from '#enums/sms_event'
import { SmsAttemptStatus, SmsStatus } from '#enums/sms_status'

export type DispatchOutcome = {
  dispatched: number
  deferred: number
  expired: number
  /** Messages that could never be sent, e.g. because their body is gone. */
  undeliverable: number
}

/**
 * Moves queued messages onto devices.
 *
 * `sms_messages` is the queue. There is no second job store to keep in sync,
 * which removes the whole class of bug where a job exists but its message does
 * not, or the two disagree about state.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED` on one message at a time inside a
 * short transaction. Two workers racing simply take different rows, and a
 * worker that dies mid-claim releases its lock when its connection drops.
 */
export default class SmsDispatcher {
  static async dispatchBatch(limit = gatewayConfig.dispatch.batchSize): Promise<DispatchOutcome> {
    const outcome: DispatchOutcome = { dispatched: 0, deferred: 0, expired: 0, undeliverable: 0 }

    for (let index = 0; index < limit; index++) {
      /**
       * Nothing can be delivered without a socket in this process, so stop
       * early rather than churning through claims we would only roll back.
       */
      if (connectionManager.size === 0) break

      const step = await this.dispatchOne()
      if (step === 'idle') break

      if (step === 'dispatched') outcome.dispatched++
      else if (step === 'deferred') outcome.deferred++
      else if (step === 'expired') outcome.expired++
      else if (step === 'undeliverable') outcome.undeliverable++
    }

    return outcome
  }

  private static async dispatchOne(): Promise<
    'dispatched' | 'deferred' | 'expired' | 'undeliverable' | 'idle'
  > {
    const claim = await db.transaction(async (trx) => {
      const rows = await trx.rawQuery(
        `SELECT id FROM sms_messages
          WHERE status = ?
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())
          ORDER BY priority ASC, next_attempt_at ASC NULLS FIRST, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED`,
        [SmsStatus.QUEUED]
      )

      const row = rows.rows?.[0]
      if (!row) return null

      const message = await SmsMessage.query({ client: trx }).where('id', row.id).firstOrFail()

      /**
       * A deadline that passed while the message waited must not be sent. A
       * one time code arriving ten minutes late is worse than none at all.
       */
      if (message.isExpiredAt()) {
        await this.markExpired(message, trx)
        return { result: 'expired' as const }
      }

      /**
       * Nothing left to send. Reachable for a message whose dispatch body was
       * already erased, or one written before that column existed. Handing it
       * to a device would deliver a blank SMS to a real subscriber, so it
       * fails here instead.
       */
      if (!message.dispatchBody) {
        await this.markUndeliverable(message, trx)
        return { result: 'undeliverable' as const }
      }

      const candidate = await this.pickRoute(message, trx)

      if (!candidate) {
        /**
         * No capacity right now. The message stays queued and is pushed a few
         * seconds into the future so the worker does not spin on it.
         */
        message.nextAttemptAt = DateTime.now().plus({ seconds: noCapacityDelaySeconds() })
        await message.useTransaction(trx).save()

        if (message.attempts === 0) {
          await SmsService.recordEvent(message, SmsEvent.NO_GATEWAY, null, null, trx)
        }

        return { result: 'deferred' as const }
      }

      const attempt = await this.assign(message, candidate, trx)
      return { result: 'assigned' as const, message, candidate, attempt }
    })

    if (claim === null) return 'idle'
    if (claim.result === 'expired') return 'expired'
    if (claim.result === 'undeliverable') return 'undeliverable'
    if (claim.result === 'deferred') return 'deferred'

    /**
     * The hand-off happens after the commit, so the row is durably assigned
     * before any device can report a result for it.
     */
    const delivered = await this.handOff(claim.message, claim.candidate)

    if (!delivered) {
      await this.requeueUndelivered(claim.message, claim.candidate, claim.attempt)
      return 'deferred'
    }

    return 'dispatched'
  }

  private static async pickRoute(message: SmsMessage, trx: any): Promise<RouteCandidate | null> {
    /**
     * A SIM that already failed this message is not tried again: whatever went
     * wrong there is likely to go wrong again, and rotating gives the message
     * a genuinely different path.
     */
    const previous = await SmsAttempt.query({ client: trx })
      .where('sms_message_id', String(message.id))
      .whereNotNull('sim_profile_id')
      .select('sim_profile_id')

    const excludeSimProfileIds = previous
      .map((attempt) => attempt.simProfileId)
      .filter((id): id is number => id !== null)

    const candidates = await SimProfileSelector.candidates(
      {
        tenantId: message.tenantId,
        recipient: message.recipientNormalized,
        requestedOperatorId: message.requestedOperatorId,
        requestedGatewayId: message.requestedGatewayId,
        excludeSimProfileIds,
      },
      trx
    )

    /**
     * Walk the shortlist: the best candidate may lose the reservation race to
     * another worker, and the next one is then the right answer.
     */
    for (const candidate of candidates) {
      if (await SimProfileSelector.reserve(candidate, trx)) {
        return candidate
      }
    }

    return null
  }

  private static async assign(
    message: SmsMessage,
    candidate: RouteCandidate,
    trx: any
  ): Promise<SmsAttempt> {
    const now = DateTime.now()

    message.merge({
      status: SmsStatus.ASSIGNED,
      simProfileId: candidate.simProfileId,
      attempts: message.attempts + 1,
      assignedAt: now,
      /**
       * The first lease only covers the acknowledgement. It is extended once
       * the device confirms it has the job, so a device that never answers
       * frees the message in seconds rather than minutes.
       */
      leaseExpiresAt: now.plus({ seconds: gatewayConfig.dispatch.ackTimeoutSeconds }),
      nextAttemptAt: null,
      errorCode: null,
      errorMessage: null,
    })
    await message.useTransaction(trx).save()

    const attempt = await new SmsAttempt()
      .fill({
        smsMessageId: message.id,
        attemptNo: message.attempts,
        simProfileId: candidate.simProfileId,
        gatewayId: candidate.gatewayId,
        status: SmsAttemptStatus.ASSIGNED,
        startedAt: now,
      })
      .useTransaction(trx)
      .save()

    await SmsService.recordEvent(
      message,
      SmsEvent.ASSIGNED,
      { gatewayUid: candidate.gatewayUid, slot: candidate.slot, attempt: message.attempts },
      candidate.gatewayId,
      trx
    )

    return attempt
  }

  /**
   * Writes the job to the device's socket. Returns false when the socket has
   * gone in the meantime, which is an ordinary outcome on mobile links.
   */
  private static async handOff(message: SmsMessage, candidate: RouteCandidate): Promise<boolean> {
    const connection = connectionManager.get(candidate.gatewayId)
    if (!connection) return false

    const payload: SmsSendPayload = {
      jobId: message.uid,
      simSlot: candidate.slot,
      to: message.recipientNormalized,
      /**
       * The verbatim text, not `messageBody`, which may be masked or absent
       * depending on the tenant's retention setting.
       */
      message: message.dispatchBody!,
      expiresAt: message.expiresAt?.toISO() ?? null,
    }

    const sent = connection.send(ServerEvent.SMS_SEND, payload)

    if (sent) {
      await SmsService.recordEvent(message, SmsEvent.DISPATCHED, {
        gatewayUid: candidate.gatewayUid,
      })
    }

    return sent
  }

  /**
   * The device never received the job, so nothing was sent. The attempt is
   * rolled back rather than counted: it would be unfair to spend one of the
   * message's three tries on a socket that closed.
   */
  private static async requeueUndelivered(
    message: SmsMessage,
    candidate: RouteCandidate,
    attempt: SmsAttempt
  ): Promise<void> {
    await db.transaction(async (trx) => {
      message.merge({
        status: SmsStatus.QUEUED,
        simProfileId: null,
        assignedAt: null,
        leaseExpiresAt: null,
        attempts: Math.max(0, message.attempts - 1),
        nextAttemptAt: DateTime.now().plus({ seconds: noCapacityDelaySeconds() }),
      })
      await message.useTransaction(trx).save()

      await SmsAttempt.query({ client: trx }).where('id', String(attempt.id)).delete()
    })

    await SimProfileSelector.release(candidate.simProfileId)

    logger.warn(
      { smsUid: message.uid, gatewayUid: candidate.gatewayUid },
      'gateway socket disappeared before hand-off, message requeued'
    )
  }

  private static async markExpired(message: SmsMessage, trx: any): Promise<void> {
    message.merge({
      status: SmsStatus.EXPIRED,
      errorCode: ErrorCode.MESSAGE_EXPIRED,
      errorMessage: 'The message deadline passed before a route was available',
      failedAt: DateTime.now(),
    })
    await message.useTransaction(trx).save()

    await SmsService.recordEvent(message, SmsEvent.EXPIRED, null, null, trx)
  }

  /**
   * Fails a message that can never be delivered. Permanent by nature: no
   * amount of retrying will bring a body back.
   */
  private static async markUndeliverable(message: SmsMessage, trx: any): Promise<void> {
    message.merge({
      status: SmsStatus.FAILED,
      errorCode: ErrorCode.BODY_UNAVAILABLE,
      errorMessage: 'The message has no body to send',
      failedAt: DateTime.now(),
    })
    await message.useTransaction(trx).save()

    await SmsService.recordEvent(
      message,
      SmsEvent.FAILED,
      { errorCode: ErrorCode.BODY_UNAVAILABLE },
      null,
      trx
    )

    logger.error({ smsUid: message.uid }, 'refused to dispatch a message with no body')
  }
}
