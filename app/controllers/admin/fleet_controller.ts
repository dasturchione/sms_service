import type { HttpContext } from '@adonisjs/core/http'
import FleetService from '#services/admin/fleet_service'
import GatewayService from '#services/gateway/gateway_service'
import SimProfileTransformer from '#transformers/sim_profile_transformer'
import UssdRequestTransformer from '#transformers/ussd_request_transformer'
import AuditService from '#services/audit/audit_service'
import { updateSimValidator } from '#validators/admin'
import { ActorType, AuditAction } from '#enums/audit_action'

/**
 * Running the fleet, as opposed to enrolling it.
 *
 * Everything here answers a question an operator has while a device is already
 * in service: how fast may this SIM send, why did that phone drop off, what did
 * the network actually reply.
 */
export default class AdminFleetController {
  /**
   * Pacing and quotas for one SIM slot.
   */
  async updateSim({ auth, params, request, serialize }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    const payload = await request.validateUsing(updateSimValidator)

    const sim = await FleetService.updateSim(params.uid, payload)

    await AuditService.record({
      action: AuditAction.TENANT_UPDATED,
      actor: { type: ActorType.USER, id: user.id, label: user.email },
      resourceType: 'sim_profile',
      resourceId: sim.uid,
      metadata: payload as Record<string, unknown>,
      ctx: request.ctx,
    })

    return serialize(SimProfileTransformer.transform(sim))
  }

  /**
   * The device's own history: events, recent connections, and the USSD it ran.
   *
   * Returned together because they are read together — "it went offline at
   * 03:10" only means something next to "the socket closed with reason X".
   */
  async diagnostics({ params, serialize }: HttpContext) {
    const gateway = await GatewayService.findByUid(params.uid)

    const [events, sessions, ussd] = await Promise.all([
      FleetService.events(gateway),
      FleetService.sessions(gateway),
      FleetService.ussdHistory(gateway),
    ])

    return serialize({
      events: events.map((event) => ({
        event: event.event,
        severity: event.severity,
        payload: event.payload,
        at: event.createdAt,
      })),
      sessions,
      ussd: UssdRequestTransformer.transform(ussd),
    })
  }
}
