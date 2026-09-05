import type { HttpContext } from '@adonisjs/core/http'
import Operator from '#models/operator'
import OperatorUssdCommand from '#models/operator_ussd_command'
import SimProfile from '#models/sim_profile'
import UssdRequest from '#models/ussd_request'
import UssdService from '#services/ussd/ussd_service'
import { hasParser } from '#services/ussd/ussd_parsers'
import AuditService from '#services/audit/audit_service'
import OperatorTransformer from '#transformers/operator_transformer'
import UssdCommandTransformer from '#transformers/ussd_command_transformer'
import UssdRequestTransformer from '#transformers/ussd_request_transformer'
import {
  createOperatorValidator,
  updateOperatorValidator,
  upsertUssdCommandValidator,
  runUssdValidator,
} from '#validators/operator'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { ActorType, AuditAction } from '#enums/audit_action'

/**
 * Operators and their self-service codes.
 *
 * Restricted to platform operators: a USSD code is dialled on a real SIM that
 * belongs to the platform, and an incorrect one can move money or change a
 * tariff. It is not something a tenant may edit.
 */
export default class AdminOperatorsController {
  async index({ auth, serialize }: HttpContext) {
    this.assertPlatformOperator(auth)

    const operators = await Operator.query().orderBy('code', 'asc')

    return serialize.withoutWrapping({ data: OperatorTransformer.transform(operators) })
  }

  async show({ auth, params, serialize }: HttpContext) {
    this.assertPlatformOperator(auth)

    const operator = await this.findByCode(params.code)
    const commands = await OperatorUssdCommand.query()
      .where('operator_id', operator.id)
      .orderBy('kind', 'asc')

    return serialize({
      operator: OperatorTransformer.transform(operator),
      ussdCommands: UssdCommandTransformer.transform(commands),
    })
  }

  async store({ auth, request, response, serialize }: HttpContext) {
    const user = this.assertPlatformOperator(auth)
    const payload = await request.validateUsing(createOperatorValidator)

    const existing = await Operator.query().where('code', payload.code).first()
    if (existing) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `An operator with code "${payload.code}" already exists`,
        { status: 422 }
      )
    }

    const operator = await Operator.create({
      name: payload.name,
      code: payload.code,
      country: payload.country ?? 'UZ',
      mcc: payload.mcc ?? null,
      mnc: payload.mnc ?? null,
      phonePrefixes: payload.phonePrefixes ?? [],
      isActive: payload.isActive ?? true,
    })

    await operator.refresh()

    await AuditService.record({
      action: AuditAction.TENANT_UPDATED,
      actor: { type: ActorType.USER, id: user.id, label: user.email },
      resourceType: 'operator',
      resourceId: operator.code,
      metadata: { created: true },
      ctx: request.ctx,
    })

    response.status(201)

    return serialize(OperatorTransformer.transform(operator))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    this.assertPlatformOperator(auth)

    const payload = await request.validateUsing(updateOperatorValidator)
    const operator = await this.findByCode(params.code)

    operator.merge({
      ...(payload.name === undefined ? {} : { name: payload.name }),
      ...(payload.country === undefined ? {} : { country: payload.country }),
      ...(payload.mcc === undefined ? {} : { mcc: payload.mcc }),
      ...(payload.mnc === undefined ? {} : { mnc: payload.mnc }),
      ...(payload.phonePrefixes === undefined ? {} : { phonePrefixes: payload.phonePrefixes }),
      ...(payload.isActive === undefined ? {} : { isActive: payload.isActive }),
    })

    await operator.save()

    return serialize(OperatorTransformer.transform(operator))
  }

  /**
   * Creates or replaces the code for one kind.
   *
   * Upsert rather than create: an operator has exactly one balance code at a
   * time, and the common action is "they changed it", not "add a second one".
   */
  async upsertUssdCommand({ auth, params, request, serialize }: HttpContext) {
    const user = this.assertPlatformOperator(auth)

    const payload = await request.validateUsing(upsertUssdCommandValidator)
    const operator = await this.findByCode(params.code)

    if (!hasParser(payload.parserKey)) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Unknown parser "${payload.parserKey}"`,
        { status: 422, details: { parserKey: payload.parserKey } }
      )
    }

    const command =
      (await OperatorUssdCommand.query()
        .where('operator_id', operator.id)
        .where('kind', payload.kind)
        .first()) ?? new OperatorUssdCommand()

    command.merge({
      operatorId: operator.id,
      kind: payload.kind,
      command: payload.command,
      steps: payload.steps ?? [],
      parserKey: payload.parserKey,
      isActive: payload.isActive ?? true,
    })

    await command.save()

    await AuditService.record({
      action: AuditAction.TENANT_UPDATED,
      actor: { type: ActorType.USER, id: user.id, label: user.email },
      resourceType: 'operator_ussd_command',
      resourceId: `${operator.code}:${payload.kind}`,
      metadata: { command: payload.command, parserKey: payload.parserKey },
      ctx: request.ctx,
    })

    return serialize(UssdCommandTransformer.transform(command))
  }

  async destroyUssdCommand({ auth, params, response }: HttpContext) {
    this.assertPlatformOperator(auth)

    const operator = await this.findByCode(params.code)
    const command = await OperatorUssdCommand.query()
      .where('operator_id', operator.id)
      .where('kind', params.kind)
      .first()

    if (!command) throw new NotFoundException('USSD command', params.kind)

    await command.delete()

    return response.noContent()
  }

  /**
   * Dials a code on one SIM, now.
   *
   * This is how a changed code gets verified: an operator edits the row and
   * runs it against a real SIM instead of waiting for the scheduler and
   * guessing from a balance that did or did not move. The reply is not
   * awaited — the device answers over its socket — so the response says what
   * was started, and the request is read back by uid.
   */
  async runUssd({ auth, params, request, response, serialize }: HttpContext) {
    this.assertPlatformOperator(auth)

    const payload = await request.validateUsing(runUssdValidator)

    const sim = await SimProfile.query().where('uid', params.uid).first()
    if (!sim) throw new NotFoundException('SIM profile', params.uid)

    const ussdRequest = await UssdService.request(sim.id, payload.kind)

    response.status(202)

    return serialize(UssdRequestTransformer.transform(ussdRequest))
  }

  /**
   * The outcome of a session started earlier, including the verbatim reply.
   */
  async showUssd({ auth, params, serialize }: HttpContext) {
    this.assertPlatformOperator(auth)

    const ussdRequest = await UssdRequest.query().where('uid', params.uid).first()
    if (!ussdRequest) throw new NotFoundException('USSD request', params.uid)

    return serialize(UssdRequestTransformer.transform(ussdRequest))
  }

  private async findByCode(code: string): Promise<Operator> {
    const operator = await Operator.query()
      .where('code', String(code ?? '').toLowerCase())
      .first()

    if (!operator) throw new NotFoundException('Operator', code)

    return operator
  }

  /**
   * The route group already proved this is staff; what is needed here is the
   * user itself, for the audit trail.
   */
  private assertPlatformOperator(auth: HttpContext['auth']) {
    return auth.use('api').getUserOrFail()
  }
}
