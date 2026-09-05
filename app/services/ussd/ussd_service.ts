import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import UssdRequest from '#models/ussd_request'
import SimProfile from '#models/sim_profile'
import OperatorUssdCommand from '#models/operator_ussd_command'
import connectionManager from '#realtime/connection_manager'
import { parseUssdResponse, type UssdParseResult } from '#services/ussd/ussd_parsers'
import { ServerEvent, type UssdExecutePayload, type UssdResultPayload } from '#realtime/protocol'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { UssdKind, UssdStatus } from '#enums/ussd'
import ussdConfig from '#config/ussd'

export type UssdRequestResult = {
  request: UssdRequest
  parsed: UssdParseResult
}

/**
 * Runs USSD sessions on a SIM and applies what comes back.
 *
 * A USSD session is not a queued job like an SMS: it is a live dialogue with
 * the network that only exists while the phone holds it, and a session started
 * five minutes ago is worthless. So requests are sent to a device that is
 * reachable *now* or refused outright — there is nothing useful to retry
 * later, and the scheduler will come round again anyway.
 */
export default class UssdService {
  /**
   * Starts a session on one SIM.
   */
  static async request(simProfileId: number, kind: UssdKind): Promise<UssdRequest> {
    const sim = await SimProfile.find(simProfileId)
    if (!sim) throw new NotFoundException('SIM profile', String(simProfileId))

    if (!sim.ussdSupported) {
      throw new DomainException(
        ErrorCode.USSD_UNSUPPORTED,
        'This device reported that it cannot run USSD',
        { status: 409 }
      )
    }

    if (!sim.operatorId) {
      throw new DomainException(
        ErrorCode.OPERATOR_NOT_FOUND,
        'The SIM has no operator, so no USSD code is known for it',
        { status: 422 }
      )
    }

    const command = await OperatorUssdCommand.query()
      .where('operator_id', sim.operatorId)
      .where('kind', kind)
      .where('is_active', true)
      .first()

    if (!command) {
      throw new DomainException(
        ErrorCode.USSD_UNSUPPORTED,
        `No active "${kind}" code is configured for this operator`,
        { status: 422 }
      )
    }

    const connection = connectionManager.get(sim.gatewayId)
    if (!connection) {
      throw new DomainException(
        ErrorCode.GATEWAY_OFFLINE,
        'The device holding this SIM is not connected to this node',
        { status: 409 }
      )
    }

    const request = await UssdRequest.create({
      simProfileId: sim.id,
      kind,
      command: command.command,
      steps: command.steps ?? [],
      status: UssdStatus.QUEUED,
      requestedAt: DateTime.now(),
    })

    const payload: UssdExecutePayload = {
      requestId: request.uid,
      simSlot: sim.slot,
      command: command.command,
      steps: command.steps ?? [],
    }

    const sent = connection.send(ServerEvent.USSD_EXECUTE, payload)

    if (!sent) {
      await this.finish(request, {
        status: UssdStatus.FAILED,
        errorCode: ErrorCode.GATEWAY_OFFLINE,
        errorMessage: 'The socket closed before the request could be sent',
      })

      throw new DomainException(ErrorCode.GATEWAY_OFFLINE, 'Could not reach the device', {
        status: 409,
      })
    }

    request.status = UssdStatus.SENDING
    await request.save()

    return request
  }

  /**
   * Applies a device's answer.
   *
   * Ownership is checked the same way SMS results are: a compromised phone
   * must not be able to write another device's balance, which is a number the
   * dispatcher routes on.
   */
  static async recordResult(gatewayId: number, payload: UssdResultPayload): Promise<void> {
    const request = await UssdRequest.query().where('uid', payload.requestId).first()

    if (!request) {
      logger.warn({ gatewayId, requestId: payload.requestId }, 'result for an unknown USSD request')
      return
    }

    /**
     * A device resending a result it was not acknowledged for is normal, and
     * applying it twice would be harmless but for the audit trail, which
     * should not show two answers to one question.
     */
    if (request.status !== UssdStatus.QUEUED && request.status !== UssdStatus.SENDING) return

    const sim = await SimProfile.query()
      .where('id', request.simProfileId)
      .where('gateway_id', gatewayId)
      .first()

    if (!sim) {
      logger.warn(
        { gatewayId, requestId: payload.requestId },
        'gateway reported on a USSD request it does not hold'
      )
      return
    }

    if (payload.status === 'unsupported') {
      await this.markUnsupported(sim, request)
      return
    }

    if (payload.status === 'failed') {
      await this.finish(request, {
        status: UssdStatus.FAILED,
        errorCode: ErrorCode.USSD_FAILED,
        errorMessage: payload.errorMessage ?? null,
        rawResponse: payload.response ?? null,
      })

      await this.countBalanceFailure(sim, request)
      return
    }

    const raw = payload.response ?? null
    const command = await OperatorUssdCommand.query()
      .where('operator_id', sim.operatorId!)
      .where('kind', request.kind)
      .first()

    const parsed = parseUssdResponse(command?.parserKey ?? '', raw)

    /**
     * The network answered but we could not read it, which usually means the
     * operator changed its wording. Recorded as a parse failure rather than a
     * success, so it shows up as something to fix instead of as a balance that
     * silently stopped updating.
     */
    const understood = Object.keys(parsed).length > 0

    await this.finish(request, {
      status: understood ? UssdStatus.SUCCESS : UssdStatus.FAILED,
      errorCode: understood ? null : ErrorCode.USSD_PARSE_FAILED,
      errorMessage: understood ? null : 'The response did not match the operator parser',
      rawResponse: raw,
      parsed: understood ? (parsed as Record<string, unknown>) : null,
    })

    if (understood) {
      await this.applyToSim(sim, request, parsed)
    } else {
      await this.countBalanceFailure(sim, request)
      logger.warn(
        { simUid: sim.uid, parserKey: command?.parserKey, raw },
        'could not parse a USSD response'
      )
    }
  }

  /**
   * Fails sessions the device never answered.
   *
   * A USSD dialogue can be swallowed entirely — the phone loses service mid
   * session, or an OEM dialog eats it — and without this the request would sit
   * in `sending` forever and the scheduler would never ask again.
   */
  static async sweepStaleRequests(): Promise<number> {
    const rows = await db
      .from('ussd_requests')
      .select('id')
      .whereIn('status', [UssdStatus.QUEUED, UssdStatus.SENDING])
      .whereRaw(`requested_at < now() - (? * interval '1 second')`, [ussdConfig.timeoutSeconds])
      .limit(100)

    let failed = 0

    for (const row of rows as Record<string, any>[]) {
      const request = await UssdRequest.find(String(row.id))
      if (!request) continue
      if (request.status !== UssdStatus.QUEUED && request.status !== UssdStatus.SENDING) continue

      await this.finish(request, {
        status: UssdStatus.FAILED,
        errorCode: ErrorCode.USSD_FAILED,
        errorMessage: 'The device did not answer within the session window',
      })

      const sim = await SimProfile.find(request.simProfileId)
      if (sim) await this.countBalanceFailure(sim, request)

      failed++
    }

    return failed
  }

  /**
   * Writes what the answer told us onto the SIM.
   *
   * The balance check timestamp is set here rather than when the request was
   * sent, so a session that failed does not look like a successful check and
   * push the next attempt a whole interval away.
   */
  private static async applyToSim(
    sim: SimProfile,
    request: UssdRequest,
    parsed: UssdParseResult
  ): Promise<void> {
    if (parsed.moneyBalance !== undefined) {
      sim.moneyBalance = parsed.moneyBalance
      if (parsed.currency) sim.balanceCurrency = parsed.currency
    }

    if (parsed.smsBalance !== undefined) sim.smsBalance = parsed.smsBalance

    /**
     * A SIM reporting its own number is how a freshly inserted SIM gets one:
     * the device cannot read it on modern Android without the operator's help.
     */
    if (parsed.phoneNumber !== undefined) sim.phoneNumber = parsed.phoneNumber

    if (this.isBalanceKind(request.kind)) {
      sim.balanceCheckedAt = DateTime.now()
      sim.balanceFailures = 0
    }

    await sim.save()
  }

  /**
   * A device that cannot run USSD at all will not start being able to, so the
   * SIM is taken out of the scheduler rather than retried on the interval.
   */
  private static async markUnsupported(sim: SimProfile, request: UssdRequest): Promise<void> {
    await this.finish(request, {
      status: UssdStatus.UNSUPPORTED,
      errorCode: ErrorCode.USSD_UNSUPPORTED,
      errorMessage: 'The device cannot run USSD',
    })

    sim.ussdSupported = false
    await sim.save()

    logger.warn({ simUid: sim.uid }, 'USSD disabled for a SIM after the device refused')
  }

  /**
   * Counts a failed balance reading. Past the limit the SIM is left alone: a
   * code that changed, or a SIM that cannot answer, would otherwise be retried
   * on the interval forever.
   */
  private static async countBalanceFailure(sim: SimProfile, request: UssdRequest): Promise<void> {
    if (!this.isBalanceKind(request.kind)) return

    sim.balanceFailures += 1

    /**
     * The timestamp moves even on failure, so the scheduler backs off instead
     * of retrying the same SIM on every pass.
     */
    sim.balanceCheckedAt = DateTime.now()
    await sim.save()

    if (sim.balanceFailures === ussdConfig.balance.giveUpAfterFailures) {
      logger.error(
        { simUid: sim.uid, failures: sim.balanceFailures },
        'giving up on balance checks for a SIM; its USSD code probably changed'
      )
    }
  }

  private static isBalanceKind(kind: UssdKind): boolean {
    return kind === UssdKind.BALANCE || kind === UssdKind.SMS_BALANCE
  }

  private static async finish(
    request: UssdRequest,
    values: {
      status: UssdStatus
      errorCode?: ErrorCode | null
      errorMessage?: string | null
      rawResponse?: string | null
      parsed?: Record<string, unknown> | null
    }
  ): Promise<void> {
    request.merge({
      status: values.status,
      errorCode: values.errorCode ?? null,
      errorMessage: values.errorMessage?.slice(0, 500) ?? null,
      rawResponse: values.rawResponse ?? request.rawResponse,
      parsed: values.parsed ?? null,
      completedAt: DateTime.now(),
    })

    await request.save()
  }
}
