import type { HttpContext } from '@adonisjs/core/http'
import { reportResultsValidator, syncSimProfilesValidator } from '#validators/gateway'
import GatewayService from '#services/gateway/gateway_service'
import GatewayPresenceService from '#services/gateway/gateway_presence_service'
import SmsResultService from '#services/sms/sms_result_service'
import SimProfileTransformer from '#transformers/sim_profile_transformer'

/**
 * The authenticated device surface.
 *
 * Everything time-critical happens over the WebSocket; these endpoints cover
 * what a device needs at startup and what it must be able to deliver even when
 * the socket is down.
 */
export default class GatewayProvisionController {
  /**
   * Configuration the device fetches on launch, before opening its socket.
   */
  async show({ gateway, serialize }: HttpContext) {
    return serialize(await GatewayPresenceService.describeSession(gateway))
  }

  /**
   * The device reports which SIM slots it can see.
   *
   * Sent on launch and whenever a SIM is inserted or removed, because the
   * platform cannot discover that on its own and would otherwise keep routing
   * to a slot that is now empty.
   */
  async syncSims({ request, gateway, serialize }: HttpContext) {
    const { sims } = await request.validateUsing(syncSimProfilesValidator)

    const profiles = await GatewayService.syncSimProfiles(gateway, sims)

    return serialize(SimProfileTransformer.transform(profiles))
  }

  /**
   * Delivery results submitted over HTTP.
   *
   * The device keeps every unacknowledged result in a local outbox and drains
   * it here when its socket is unavailable. Without this path, a message sent
   * moments before the link dropped would look like a failure and be sent a
   * second time.
   */
  async reportResults({ request, gateway, serialize }: HttpContext) {
    const { results } = await request.validateUsing(reportResultsValidator)

    for (const result of results) {
      await SmsResultService.recordResult(gateway.id, result)
    }

    /**
     * The device may forget every job id echoed back here. Results for jobs
     * this device no longer holds are absorbed silently, which is what makes
     * a blind replay after a reconnect safe.
     */
    return serialize({ accepted: results.map((result) => result.jobId) })
  }
}
