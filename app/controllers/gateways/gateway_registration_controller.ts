import type { HttpContext } from '@adonisjs/core/http'
import { claimGatewayValidator, registerGatewayValidator } from '#validators/gateway'
import GatewayService from '#services/gateway/gateway_service'
import GatewayTransformer from '#transformers/gateway_transformer'

/**
 * The unauthenticated half of device onboarding.
 *
 * Both endpoints are open by necessity: a phone that has never been approved
 * has no credential to present. They are safe because neither grants anything.
 * Registering only queues a device for a human to look at, and claiming
 * requires a code that a human just issued.
 */
export default class GatewayRegistrationController {
  async store({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(registerGatewayValidator)

    const gateway = await GatewayService.register(payload, request.ctx)

    response.status(201)

    return serialize({
      gateway: GatewayTransformer.transform(gateway),
      /**
       * Spelled out because this is the entire onboarding instruction the app
       * has to show its operator.
       */
      nextStep: gateway.isApproved
        ? 'Enter the claim code issued by an operator at /api/v1/gw/claim'
        : 'Waiting for an operator to approve this device',
    })
  }

  /**
   * Exchanges a one-time claim code for the device's long-lived token.
   */
  async claim({ request, serialize }: HttpContext) {
    const { deviceId, claimCode } = await request.validateUsing(claimGatewayValidator)

    const { gateway, token } = await GatewayService.claim(deviceId, claimCode)

    return serialize({
      gateway: GatewayTransformer.transform(gateway),
      accessToken: token,
      tokenType: 'Bearer',
    })
  }
}
