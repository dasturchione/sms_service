import type { HttpContext } from '@adonisjs/core/http'
import TenantService from '#services/admin/tenant_service'
import AuditService from '#services/audit/audit_service'
import TenantTransformer from '#transformers/tenant_transformer'
import ApiClientTransformer from '#transformers/api_client_transformer'
import WebhookEndpointTransformer from '#transformers/webhook_endpoint_transformer'
import WebhookEndpointService from '#services/webhooks/webhook_endpoint_service'
import {
  createApiClientValidator,
  createTenantValidator,
  updateApiClientValidator,
  updateTenantValidator,
} from '#validators/admin'
import { ActorType, AuditAction } from '#enums/audit_action'

/**
 * Tenants and their credentials.
 *
 * Everything here is behind `platformAdmin`: creating a tenant and issuing a
 * secret that can spend money on the platform's SIMs is staff work, not
 * something a tenant does to itself.
 */
export default class AdminTenantsController {
  async index({ request, serialize }: HttpContext) {
    const search = request.input('search')?.toString().slice(0, 120)
    const tenants = await TenantService.list(search)

    return serialize.withoutWrapping({ data: TenantTransformer.transform(tenants) })
  }

  async show({ params, serialize }: HttpContext) {
    const tenant = await TenantService.findByUid(params.uid)
    const [clients, counts] = await Promise.all([
      TenantService.listClients(tenant.id),
      TenantService.countsFor(tenant.id),
    ])

    return serialize({
      tenant: TenantTransformer.transform(tenant),
      clients: ApiClientTransformer.transform(clients),
      counts,
    })
  }

  async store({ auth, request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createTenantValidator)
    const tenant = await TenantService.create(payload)

    await AuditService.record({
      action: AuditAction.TENANT_CREATED,
      actor: this.actor(auth),
      tenantId: tenant.id,
      resourceType: 'tenant',
      resourceId: tenant.uid,
      metadata: { name: tenant.name },
      ctx: request.ctx,
    })

    response.status(201)

    return serialize(TenantTransformer.transform(tenant))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const payload = await request.validateUsing(updateTenantValidator)
    const tenant = await TenantService.update(params.uid, payload)

    await AuditService.record({
      action: AuditAction.TENANT_UPDATED,
      actor: this.actor(auth),
      tenantId: tenant.id,
      resourceType: 'tenant',
      resourceId: tenant.uid,
      metadata: payload as Record<string, unknown>,
      ctx: request.ctx,
    })

    return serialize(TenantTransformer.transform(tenant))
  }

  async indexClients({ params, serialize }: HttpContext) {
    const tenant = await TenantService.findByUid(params.uid)
    const clients = await TenantService.listClients(tenant.id)

    return serialize.withoutWrapping({ data: ApiClientTransformer.transform(clients) })
  }

  /**
   * Issues credentials. The response carries the secret, which is the only
   * time it exists in readable form anywhere.
   */
  async storeClient({ auth, params, request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createApiClientValidator)
    const tenant = await TenantService.findByUid(params.uid)

    const { client, clientSecret } = await TenantService.createClient(tenant, payload)

    await AuditService.record({
      action: AuditAction.API_CLIENT_CREATED,
      actor: this.actor(auth),
      tenantId: tenant.id,
      resourceType: 'api_client',
      resourceId: client.uid,
      metadata: { name: client.name, abilities: client.abilities },
      ctx: request.ctx,
    })

    response.status(201)

    return serialize.withoutWrapping({
      data: ApiClientTransformer.transform(client),

      /**
       * Outside `data` on purpose: it is not a property of the client that can
       * be read back, it is a one time disclosure.
       */
      clientSecret,
    })
  }

  async updateClient({ auth, params, request, serialize }: HttpContext) {
    const payload = await request.validateUsing(updateApiClientValidator)
    const tenant = await TenantService.findByUid(params.uid)

    const client = await TenantService.updateClient(tenant.id, params.clientUid, payload)

    if (payload.isActive === false) {
      await AuditService.record({
        action: AuditAction.API_CLIENT_DISABLED,
        actor: this.actor(auth),
        tenantId: tenant.id,
        resourceType: 'api_client',
        resourceId: client.uid,
        ctx: request.ctx,
      })
    }

    return serialize(ApiClientTransformer.transform(client))
  }

  /**
   * A tenant's webhook endpoints, read-only.
   *
   * Support's question is "are their webhooks failing", which the failure
   * counters answer. Editing them is the tenant's own business: they own the
   * receiver and they hold the signing secret.
   */
  async indexWebhooks({ params, serialize }: HttpContext) {
    const tenant = await TenantService.findByUid(params.uid)
    const endpoints = await WebhookEndpointService.listForTenant(tenant.id)

    return serialize.withoutWrapping({ data: WebhookEndpointTransformer.transform(endpoints) })
  }

  private actor(auth: HttpContext['auth']) {
    const user = auth.use('api').getUserOrFail()

    return { type: ActorType.USER, id: user.id, label: user.email }
  }
}
