import type { HttpContext } from '@adonisjs/core/http'
import Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import GatewayService from '#services/gateway/gateway_service'
import GatewayTransformer from '#transformers/gateway_transformer'
import SimProfileTransformer from '#transformers/sim_profile_transformer'
import AuditService from '#services/audit/audit_service'
import connectionManager from '#realtime/connection_manager'
import { ServerEvent } from '#realtime/protocol'
import { updateGatewayValidator } from '#validators/admin'
import { ActorType, AuditAction } from '#enums/audit_action'
import { GatewayStatus } from '#enums/gateway_status'

/**
 * Fleet management for platform operators.
 *
 * Approving a device is the one action that turns an unknown phone into
 * infrastructure that can spend a tenant's money, so it is restricted to
 * platform operators rather than tenant administrators.
 */
export default class AdminGatewaysController {
  async index({ auth, request, serialize }: HttpContext) {
    this.assertPlatformOperator(auth)

    const status = request.input('status')
    const query = Gateway.query().orderBy('id', 'desc').limit(200)

    if (status) query.where('status', status)

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

  async show({ auth, params, serialize }: HttpContext) {
    this.assertPlatformOperator(auth)

    const gateway = await GatewayService.findByUid(params.uid)
    const profiles = await SimProfile.query().where('gateway_id', gateway.id).orderBy('slot', 'asc')

    return serialize({
      gateway: GatewayTransformer.transform(gateway),
      simProfiles: SimProfileTransformer.transform(profiles),
    })
  }

  /**
   * Changes what an operator is allowed to decide about a device.
   *
   * Narrow on purpose: name, routing priority, concurrency and whether it is in
   * service. Everything else is reported by the phone, and a field the panel
   * could overwrite is a field that will eventually disagree with reality.
   */
  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    const payload = await request.validateUsing(updateGatewayValidator)

    const gateway = await GatewayService.findByUid(params.uid)

    gateway.merge({
      ...(payload.name === undefined ? {} : { name: payload.name }),
      ...(payload.priority === undefined ? {} : { priority: payload.priority }),
      ...(payload.maxInFlight === undefined ? {} : { maxInFlight: payload.maxInFlight }),
      ...(payload.isActive === undefined ? {} : { isActive: payload.isActive }),
    })

    await gateway.save()

    await GatewayService.logEvent(gateway, 'updated', { by: user.uid, ...payload }, 'info')

    /**
     * The device holds a copy of its own limits, so a change has to reach it
     * or it would keep pacing itself by the old ones until it reconnected.
     */
    const connection = connectionManager.get(gateway.id)
    if (connection) {
      connection.send(ServerEvent.CONFIG_UPDATE, {
        maxInFlight: gateway.maxInFlight,
        isActive: gateway.isActive,
      })
    }

    return serialize(GatewayTransformer.transform(gateway))
  }

  /**
   * Approves a device and returns a claim code.
   *
   * The code is shown exactly once, here. It is never stored in readable form
   * and never sent to the device: the device asks for it by typing it in, so a
   * code that leaks from a log or a screenshot is worth nothing after its
   * short lifetime.
   */
  async approve({ auth, params, request, serialize }: HttpContext) {
    const user = this.assertPlatformOperator(auth)

    const gateway = await GatewayService.findByUid(params.uid)
    const claimCode = await GatewayService.approve(gateway, user, request.ctx)

    return serialize({
      gateway: GatewayTransformer.transform(gateway),
      claimCode,
      expiresAt: gateway.claimCodeExpiresAt,
    })
  }

  /**
   * Issues a fresh claim code for a device that is already approved.
   *
   * The common case this exists for: a phone was approved, nobody typed the
   * code in within its half hour, and the device now sits there permanently
   * unable to connect. Approval is not the thing that expired — the code is —
   * so re-approving is the whole fix, and it has its own route because
   * "approve" is not what an operator is looking for at that moment.
   *
   * Issuing invalidates any previous code, which is why it is safe to press
   * twice.
   */
  async issueClaimCode({ auth, params, request, serialize }: HttpContext) {
    const user = this.assertPlatformOperator(auth)

    const gateway = await GatewayService.findByUid(params.uid)
    const claimCode = await GatewayService.approve(gateway, user, request.ctx)

    return serialize({
      gateway: GatewayTransformer.transform(gateway),
      claimCode,
      expiresAt: gateway.claimCodeExpiresAt,
    })
  }

  /**
   * Puts a disabled device back into service.
   *
   * Enabling alone would not be enough, and that is the whole reason this is
   * its own action rather than a flag: disabling revoked the phone's token, so
   * an "enabled" device with no credential would sit there looking healthy and
   * never connect. The recovery is therefore enable *and* re-approve, in one
   * step, returning a fresh claim code to type into the phone.
   */
  async enable({ auth, params, request, serialize }: HttpContext) {
    const user = this.assertPlatformOperator(auth)

    const gateway = await GatewayService.findByUid(params.uid)

    gateway.merge({
      isActive: true,

      /**
       * Offline rather than online: the device is allowed back, but nothing
       * has heard from it yet, and claiming that it is online would put it
       * straight into the routing pool.
       */
      status: GatewayStatus.OFFLINE,
      nodeId: null,
    })
    await gateway.save()

    const claimCode = await GatewayService.approve(gateway, user, request.ctx)

    await GatewayService.logEvent(gateway, 'enabled', { by: user.uid }, 'info')

    return serialize({
      gateway: GatewayTransformer.transform(gateway),
      claimCode,
      expiresAt: gateway.claimCodeExpiresAt,
    })
  }

  /**
   * Takes a device out of service and revokes its credentials.
   *
   * Both halves matter: disabling without revoking would leave a working token
   * on a phone that may be lost or stolen.
   */
  async disable({ auth, params, request, serialize }: HttpContext) {
    const user = this.assertPlatformOperator(auth)

    const gateway = await GatewayService.findByUid(params.uid)

    gateway.merge({ isActive: false, status: GatewayStatus.DISABLED, nodeId: null })
    await gateway.save()

    const tokens = await Gateway.accessTokens.all(gateway)
    for (const token of tokens) {
      await Gateway.accessTokens.delete(gateway, token.identifier)
    }

    connectionManager.get(gateway.id)?.close('device disabled')

    await GatewayService.logEvent(gateway, 'disabled', { by: user.uid }, 'warning')
    await AuditService.record({
      action: AuditAction.GATEWAY_DISABLED,
      actor: { type: ActorType.USER, id: user.id, label: user.email },
      resourceType: 'gateway',
      resourceId: gateway.uid,
      ctx: request.ctx,
    })

    return serialize(GatewayTransformer.transform(gateway))
  }

  /**
   * The route group already proved this is staff; what is needed here is the
   * user itself, for the audit trail.
   */
  private assertPlatformOperator(auth: HttpContext['auth']) {
    return auth.use('api').getUserOrFail()
  }
}
