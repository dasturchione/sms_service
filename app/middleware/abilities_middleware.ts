import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ForbiddenException } from '#exceptions/domain_exception'
import type { ClientAbility } from '#enums/ability'

/**
 * Enforces the abilities stamped on the presented token.
 *
 * The check is against the token rather than the client record, so narrowing
 * a client's grants takes effect on its next token without having to hunt
 * down and revoke the ones already issued.
 */
export default class AbilitiesMiddleware {
  async handle(ctx: HttpContext, next: NextFn, required: ClientAbility[] = []) {
    const token = ctx.apiClient?.currentAccessToken

    if (!token) {
      throw new ForbiddenException('This endpoint requires a client access token')
    }

    const missing = required.filter((ability) => !token.allows(ability))
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required ability: ${missing.join(', ')}`)
    }

    return next()
  }
}
