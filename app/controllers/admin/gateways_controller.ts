import type { HttpContext } from '@adonisjs/core/http'
import Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import GatewayService from '#services/gateway/gateway_service'
import GatewayTransformer from '#transformers/gateway_transformer'
import SimProfileTransformer from '#transformers/sim_profile_transformer'
import AuditService from '#services/audit/audit_service'
import connectionManager from '#realtime/connection_manager'
import { ForbiddenException } from '#exceptions/domain_exception'
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

  private assertPlatformOperator(auth: HttpContext['auth']) {
    const user = auth.use('api').getUserOrFail()

    if (!user.isPlatformOperator || !user.canAdminister) {
      throw new ForbiddenException('Only platform operators may manage gateways')
    }

    return user
  }
}
