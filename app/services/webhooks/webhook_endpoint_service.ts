import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import WebhookEndpoint from '#models/webhook_endpoint'
import type ApiClient from '#models/api_client'
import AuditService from '#services/audit/audit_service'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { ActorType, AuditAction } from '#enums/audit_action'
import type { WebhookEvent } from '#enums/webhook_event'

/**
 * How many endpoints one tenant may register. Every event fans out to all of
 * them, so an unbounded list would let one tenant multiply the platform's
 * outbound work at will.
 */
const MAX_ENDPOINTS_PER_TENANT = 10

export type CreateEndpointInput = {
  url: string
  events?: WebhookEvent[]
}

export type UpdateEndpointInput = {
  url?: string
  events?: WebhookEvent[]
  isActive?: boolean
}

/**
 * CRUD for a tenant's webhook endpoints.
 *
 * Every lookup takes the tenant as part of the query rather than checking it
 * afterwards, so another tenant's uid is a plain 404 and reveals nothing.
 */
export default class WebhookEndpointService {
  static async listForTenant(tenantId: number): Promise<WebhookEndpoint[]> {
    return WebhookEndpoint.query().where('tenant_id', tenantId).orderBy('id', 'asc')
  }

  static async findForTenant(tenantId: number, uid: string): Promise<WebhookEndpoint> {
    const endpoint = await WebhookEndpoint.query()
      .where('tenant_id', tenantId)
      .where('uid', uid)
      .first()

    if (!endpoint) throw new NotFoundException('Webhook endpoint', uid)

    return endpoint
  }

  /**
   * Creates an endpoint and returns it together with its signing secret.
   *
   * The secret is returned exactly once. Storing it is the tenant's job; being
   * able to re-read it later would mean anyone with read access to the API
   * could forge deliveries.
   */
  static async create(
    tenantId: number,
    input: CreateEndpointInput,
    options: { apiClient?: ApiClient | null; ctx?: HttpContext } = {}
  ): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
    const existing = await WebhookEndpoint.query()
      .where('tenant_id', tenantId)
      .count('* as total')
      .first()

    const total = Number((existing as unknown as { $extras: { total: string } }).$extras.total)

    if (total >= MAX_ENDPOINTS_PER_TENANT) {
      throw new DomainException(
        ErrorCode.QUOTA_EXCEEDED,
        `A tenant may register at most ${MAX_ENDPOINTS_PER_TENANT} webhook endpoints`,
        { status: 422 }
      )
    }

    const secret = `whsec_${randomBytes(32).toString('hex')}`

    const endpoint = await WebhookEndpoint.create({
      tenantId,
      url: input.url,
      secret,
      events: input.events ?? [],
      isActive: true,
      failureCount: 0,
    })

    await endpoint.refresh()

    await AuditService.record({
      action: AuditAction.WEBHOOK_CREATED,
      actor: options.apiClient
        ? {
            type: ActorType.API_CLIENT,
            id: options.apiClient.id,
            label: options.apiClient.clientId,
          }
        : { type: ActorType.SYSTEM },
      tenantId,
      resourceType: 'webhook_endpoint',
      resourceId: endpoint.uid,
      metadata: { url: endpoint.url, events: endpoint.events },
      ctx: options.ctx,
    })

    return { endpoint, secret }
  }

  static async update(
    tenantId: number,
    uid: string,
    input: UpdateEndpointInput
  ): Promise<WebhookEndpoint> {
    const endpoint = await this.findForTenant(tenantId, uid)

    if (input.url !== undefined) endpoint.url = input.url
    if (input.events !== undefined) endpoint.events = input.events

    if (input.isActive !== undefined) {
      endpoint.isActive = input.isActive

      /**
       * Re-enabling clears the failure streak that switched the endpoint off.
       * Leaving it would disable the endpoint again on the next single failure,
       * which is not what "I fixed it" means.
       */
      if (input.isActive) {
        endpoint.failureCount = 0
        endpoint.disabledAt = null
      } else {
        endpoint.disabledAt = DateTime.now()
      }
    }

    await endpoint.save()

    return endpoint
  }

  static async destroy(tenantId: number, uid: string): Promise<void> {
    const endpoint = await this.findForTenant(tenantId, uid)
    await endpoint.delete()
  }
}
