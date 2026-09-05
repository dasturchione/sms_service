import type { HttpContext } from '@adonisjs/core/http'
import WebhookEndpointService from '#services/webhooks/webhook_endpoint_service'
import WebhookEndpointTransformer from '#transformers/webhook_endpoint_transformer'
import { createWebhookEndpointValidator, updateWebhookEndpointValidator } from '#validators/webhook'

/**
 * Endpoint management for tenant backends.
 *
 * A tenant configures where its events go and nothing else: which events exist
 * and how they are retried are platform decisions, not per-endpoint settings.
 */
export default class WebhookEndpointsController {
  async index({ tenant, serialize }: HttpContext) {
    const endpoints = await WebhookEndpointService.listForTenant(tenant.id)

    return serialize.withoutWrapping({
      data: WebhookEndpointTransformer.transform(endpoints),
    })
  }

  /**
   * Creates an endpoint. The response carries the signing secret, which is the
   * only time it is ever readable.
   */
  async store({ request, response, tenant, apiClient, serialize }: HttpContext) {
    const payload = await request.validateUsing(createWebhookEndpointValidator)

    const { endpoint, secret } = await WebhookEndpointService.create(tenant.id, payload, {
      apiClient,
      ctx: request.ctx,
    })

    response.status(201)

    return serialize.withoutWrapping({
      data: WebhookEndpointTransformer.transform(endpoint),

      /**
       * Deliberately outside `data`: it is not a property of the endpoint that
       * can be read back, it is a one time disclosure.
       */
      secret,
    })
  }

  async show({ params, tenant, serialize }: HttpContext) {
    const endpoint = await WebhookEndpointService.findForTenant(tenant.id, params.uid)

    return serialize(WebhookEndpointTransformer.transform(endpoint))
  }

  async update({ params, request, tenant, serialize }: HttpContext) {
    const payload = await request.validateUsing(updateWebhookEndpointValidator)
    const endpoint = await WebhookEndpointService.update(tenant.id, params.uid, payload)

    return serialize(WebhookEndpointTransformer.transform(endpoint))
  }

  async destroy({ params, response, tenant }: HttpContext) {
    await WebhookEndpointService.destroy(tenant.id, params.uid)

    return response.noContent()
  }
}
