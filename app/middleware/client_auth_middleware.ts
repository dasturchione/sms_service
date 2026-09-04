import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type ApiClient from '#models/api_client'
import Tenant from '#models/tenant'
import DomainException, { TenantSuspendedException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'

/**
 * Authenticates a tenant backend and establishes the tenant context in one
 * step.
 *
 * Authentication and tenant resolution are deliberately not separate
 * middleware: a route that authenticates but forgets the tenant would run
 * queries with no isolation at all, and that mistake would not be visible in
 * the route definition.
 */
export default class ClientAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.authenticateUsing(['client'])
    const client = ctx.auth.use('client').getUserOrFail()

    if (!client.isActive) {
      throw new DomainException(ErrorCode.CLIENT_DISABLED, 'This API client has been disabled', {
        status: 403,
      })
    }

    const tenant = await Tenant.find(client.tenantId)
    if (!tenant || !tenant.isUsable) {
      throw new TenantSuspendedException()
    }

    ctx.apiClient = client
    ctx.tenant = tenant

    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /**
     * The authenticated tenant backend. Present on every route behind
     * `middleware.clientAuth()`.
     */
    apiClient: ApiClient

    /**
     * The tenant every query on this request must be scoped to.
     */
    tenant: Tenant
  }
}
