import type { HttpContext } from '@adonisjs/core/http'
import { Secret } from '@adonisjs/core/helpers'
import Gateway from '#models/gateway'
import { registerGatewayValidator } from '#validators/gateway'
import GatewayService from '#services/gateway/gateway_service'
import GatewayTransformer from '#transformers/gateway_transformer'
import { GatewayAbility } from '#enums/ability'

/**
 * Device onboarding.
 *
 * Open by necessity, since a new phone has no credential yet, and safe
 * because registering grants nothing on its own: a new device carries no
 * traffic until it is put into the pool or claimed by a tenant.
 */
export default class GatewayRegistrationController {
  async store({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(registerGatewayValidator)

    const { gateway, token } = await GatewayService.register(payload, {
      presentedBy: await this.presentedDevice(request.header('authorization')),
      ctx: request.ctx,
    })

    response.status(token ? 201 : 200)

    return serialize({
      gateway: GatewayTransformer.transform(gateway),

      /**
       * Only on first registration. A refresh keeps the token the device
       * already holds.
       */
      accessToken: token,
      tokenType: token ? 'Bearer' : null,

      /**
       * The code the phone shows as a QR. A tenant claims the device with it,
       * then names it when sending.
       */
      code: gateway.displayCode,
    })
  }

  /**
   * The device a request proves to be, if it carries a valid device token.
   * Lets a registered phone refresh its details without registering anew.
   */
  private async presentedDevice(header: string | undefined): Promise<Gateway | null> {
    if (!header?.startsWith('Bearer ')) return null

    const accessToken = await Gateway.accessTokens.verify(new Secret(header.slice(7).trim()))
    if (!accessToken || !accessToken.allows(GatewayAbility.CONNECT)) return null

    return Gateway.find(accessToken.tokenableId)
  }
}
