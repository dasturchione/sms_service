import type { HttpContext } from '@adonisjs/core/http'
import Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import Tenant from '#models/tenant'
import GatewayService from '#services/gateway/gateway_service'
import GatewayAssignmentService from '#services/gateway/gateway_assignment'
import GatewayTransformer from '#transformers/gateway_transformer'
import SimProfileTransformer from '#transformers/sim_profile_transformer'
import AuditService from '#services/audit/audit_service'
import connectionManager from '#realtime/connection_manager'
import { ServerEvent } from '#realtime/protocol'
import { updateGatewayValidator } from '#validators/admin'
import { NotFoundException } from '#exceptions/domain_exception'
import { ActorType, AuditAction } from '#enums/audit_action'
import { GatewayAssignment, GatewayStatus } from '#enums/gateway_status'
import type User from '#models/user'

/**
 * Fleet management for platform operators.
 *
 * Devices register and connect on their own; nothing here approves them.
 * What an operator decides is what a device is for: the shared pool, a
 * particular tenant, or nothing yet.
 */
export default class AdminGatewaysController {
  async index({ request, serialize }: HttpContext) {
    const status = request.input('status')
    const assignment = request.input('assignment')

    const query = Gateway.query().preload('tenant').orderBy('id', 'desc').limit(200)

    if (status) query.where('status', status)
    if (assignment) query.where('assignment', assignment)

    const gateways = await query

    return serialize.withoutWrapping({
      data: GatewayTransformer.transform(gateways),
      meta: {
        /**
         * How many devices this particular instance can actually reach, which
         * is not the same as how many the database calls online.
         */
        connectedToThisNode: connectionManager.size,
      },
    })
  }

  async show({ params, serialize }: HttpContext) {
    const gateway = await this.find(params.uid)
    const profiles = await SimProfile.query().where('gateway_id', gateway.id).orderBy('slot', 'asc')

    return serialize({
      gateway: GatewayTransformer.transform(gateway),
      simProfiles: SimProfileTransformer.transform(profiles),
    })
  }

  /**
   * Changes what an operator is allowed to decide about a device: its name,
   * routing priority, concurrency, whether it is in service, and what it is
   * for.
   *
   * Everything else is reported by the phone, and a field the panel could
   * overwrite is a field that will eventually disagree with reality.
   */
  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    const payload = await request.validateUsing(updateGatewayValidator)

    const gateway = await this.find(params.uid)

    gateway.merge({
      ...(payload.name === undefined ? {} : { name: payload.name }),
      ...(payload.priority === undefined ? {} : { priority: payload.priority }),
      ...(payload.maxInFlight === undefined ? {} : { maxInFlight: payload.maxInFlight }),
      ...(payload.smsPerMinute === undefined ? {} : { smsPerMinute: payload.smsPerMinute }),
      ...(payload.isActive === undefined ? {} : { isActive: payload.isActive }),
    })
    await gateway.save()

    await GatewayService.logEvent(
      gateway,
      'updated',
      { by: user.uid, ...payload, tenant: payload.tenant ?? undefined },
      'info'
    )

    if (payload.assignment !== undefined) {
      const tenant = await this.resolveTenant(payload.assignment, payload.tenant)

      await GatewayAssignmentService.assign(gateway, payload.assignment, tenant, {
        actor: this.actor(user),
        ctx: request.ctx,
      })
    } else {
      /**
       * The device holds a copy of its own limits, so a change has to reach
       * it or it would keep pacing itself by the old ones until it
       * reconnected.
       */
      connectionManager.get(gateway.id)?.send(ServerEvent.CONFIG_UPDATE, {
        maxInFlight: gateway.maxInFlight,
        isActive: gateway.isActive,
      })
    }

    await gateway.load('tenant')
    return serialize(GatewayTransformer.transform(gateway))
  }

  /**
   * Puts a disabled device back into service.
   *
   * Disabling kept the phone's token, so nothing has to be done on the phone:
   * it is already retrying, and it gets back in on its next attempt.
   */
  async enable({ auth, params, request, serialize }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    const gateway = await this.find(params.uid)

    gateway.merge({
      isActive: true,

      /**
       * Offline rather than online: the device is allowed back, but nothing
       * has heard from it yet, and claiming that it is online would put it
       * straight into routing.
       */
      status: GatewayStatus.OFFLINE,
      nodeId: null,
    })
    await gateway.save()

    await GatewayService.logEvent(gateway, 'enabled', { by: user.uid }, 'info')
    await AuditService.record({
      action: AuditAction.GATEWAY_ENABLED,
      actor: this.actor(user),
      tenantId: gateway.tenantId,
      resourceType: 'gateway',
      resourceId: gateway.uid,
      ctx: request.ctx,
    })

    return serialize(GatewayTransformer.transform(gateway))
  }

  /**
   * Takes a device out of service.
   *
   * The token is kept so the device can be enabled again without anyone
   * touching the phone; the authentication check refuses it on every attempt
   * in between. For a phone that is lost or stolen, `forget` is the action
   * that removes the credential for good.
   */
  async disable({ auth, params, request, serialize }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    const gateway = await this.find(params.uid)

    gateway.merge({ isActive: false, status: GatewayStatus.DISABLED, nodeId: null })
    await gateway.save()

    connectionManager.get(gateway.id)?.close('device disabled')

    await GatewayService.logEvent(gateway, 'disabled', { by: user.uid }, 'warning')
    await AuditService.record({
      action: AuditAction.GATEWAY_DISABLED,
      actor: this.actor(user),
      tenantId: gateway.tenantId,
      resourceType: 'gateway',
      resourceId: gateway.uid,
      ctx: request.ctx,
    })

    return serialize(GatewayTransformer.transform(gateway))
  }

  /**
   * Removes a device for good: its record and every token it holds.
   *
   * For a decommissioned, lost or stolen phone. The phone itself, if it is
   * still around, is told its credential is gone and can register again as a
   * new device.
   */
  async destroy({ auth, params, request, response }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    const gateway = await this.find(params.uid)

    if (gateway.assignment === GatewayAssignment.TENANT) {
      /**
       * Settles anything the owning tenant still has pinned to this device
       * before the device disappears.
       */
      await GatewayAssignmentService.assign(gateway, GatewayAssignment.UNASSIGNED, null, {
        actor: this.actor(user),
        ctx: request.ctx,
      })
    }

    connectionManager.get(gateway.id)?.close('device removed')

    await AuditService.record({
      action: AuditAction.GATEWAY_FORGOTTEN,
      actor: this.actor(user),
      tenantId: gateway.tenantId,
      resourceType: 'gateway',
      resourceId: gateway.uid,
      metadata: { code: gateway.code, deviceId: gateway.deviceId },
      ctx: request.ctx,
    })

    await GatewayService.forget(gateway)

    return response.noContent()
  }

  private async find(uid: string): Promise<Gateway> {
    const gateway = await GatewayService.findByUid(uid)
    await gateway.load('tenant')
    return gateway
  }

  private async resolveTenant(
    assignment: GatewayAssignment,
    tenantUid: string | null | undefined
  ): Promise<Tenant | null> {
    if (assignment !== GatewayAssignment.TENANT) return null
    if (!tenantUid) throw new NotFoundException('Tenant')

    const tenant = await Tenant.findBy('uid', tenantUid)
    if (!tenant) throw new NotFoundException('Tenant', tenantUid)

    return tenant
  }

  private actor(user: User) {
    return { type: ActorType.USER, id: user.id, label: user.email }
  }
}
