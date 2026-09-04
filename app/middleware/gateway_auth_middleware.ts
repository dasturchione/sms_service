import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type Gateway from '#models/gateway'
import DomainException from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { GatewayStatus } from '#enums/gateway_status'

/**
 * Authenticates an Android device.
 *
 * Approval and activation are re-checked on every request rather than only at
 * claim time, so an operator disabling a device takes effect immediately
 * instead of at some unknown point in the future.
 */
export default class GatewayAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.authenticateUsing(['gateway'])
    const gateway = ctx.auth.use('gateway').getUserOrFail()

    if (!gateway.isActive || gateway.status === GatewayStatus.DISABLED) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'This device has been disabled', {
        status: 403,
      })
    }

    if (!gateway.isApproved) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'This device is not approved', { status: 403 })
    }

    ctx.gateway = gateway
    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /**
     * The authenticated device. Present on routes behind `gatewayAuth()`.
     */
    gateway: Gateway
  }
}
