import type WebhookEndpoint from '#models/webhook_endpoint'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * The tenant's view of one of its endpoints.
 *
 * The secret is absent by design: it is shown once, at creation, and never
 * again. An endpoint listing is the kind of response that ends up in logs and
 * dashboards, and a signing key that appears there is no longer a secret.
 */
export default class WebhookEndpointTransformer extends BaseTransformer<WebhookEndpoint> {
  toObject() {
    const endpoint = this.resource

    return {
      uid: endpoint.uid,
      url: endpoint.url,

      /**
       * Empty means every event, which is what the endpoint was created with
       * unless the caller narrowed it.
       */
      events: endpoint.events,

      isActive: endpoint.isActive,

      /**
       * Consecutive failures. A non-zero value here is the first thing to look
       * at when a tenant reports missing webhooks.
       */
      failureCount: endpoint.failureCount,

      lastSuccessAt: endpoint.lastSuccessAt,
      lastFailureAt: endpoint.lastFailureAt,
      disabledAt: endpoint.disabledAt,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    }
  }
}
