import type ApiClient from '#models/api_client'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * The secret is absent by design; only its hash is stored, and the plaintext
 * exists once, in the response that created the client.
 */
export default class ApiClientTransformer extends BaseTransformer<ApiClient> {
  toObject() {
    const client = this.resource

    return {
      uid: client.uid,
      name: client.name,

      /**
       * The public half of the credential. Safe to show: it identifies the
       * client in logs and support tickets and grants nothing on its own.
       */
      clientId: client.clientId,

      abilities: client.abilities,
      rateLimitPerMin: client.rateLimitPerMin,
      isActive: client.isActive,
      lastUsedAt: client.lastUsedAt,
      createdAt: client.createdAt,
    }
  }
}
