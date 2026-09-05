import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ForbiddenException } from '#exceptions/domain_exception'

/**
 * Guards the platform's own back office.
 *
 * A platform operator is a user with no tenant: the absence of a tenant is
 * what makes someone staff, so there is no separate flag that can drift out of
 * step with it. Tenant administrators authenticate through the same guard and
 * must never reach these routes, which is why the check is here rather than
 * repeated in each controller — a route added later inherits it from the
 * group instead of relying on someone remembering.
 */
export default class PlatformAdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.authenticateUsing(['api'])
    const user = ctx.auth.use('api').getUserOrFail()

    if (!user.isActive) {
      throw new ForbiddenException('This account has been disabled')
    }

    if (!user.isPlatformOperator || !user.canAdminister) {
      throw new ForbiddenException('This area is restricted to platform operators')
    }

    return next()
  }
}
