import type { HttpContext } from '@adonisjs/core/http'
import { clientTokenValidator } from '#validators/auth'
import ClientAuthService from '#services/auth/client_auth_service'
import AuditService from '#services/audit/audit_service'
import ApiClient from '#models/api_client'
import { ActorType, AuditAction } from '#enums/audit_action'

/**
 * Credential exchange for tenant backends.
 *
 * Kept apart from the human login controller because the two have different
 * lifetimes, different revocation stories and different abilities.
 */
export default class ClientTokensController {
  async store({ request, serialize }: HttpContext) {
    const { clientId, clientSecret } = await request.validateUsing(clientTokenValidator)

    const issued = await ClientAuthService.issueToken(clientId, clientSecret)

    await AuditService.record({
      action: AuditAction.TOKEN_ISSUED,
      actor: {
        type: ActorType.API_CLIENT,
        id: issued.client.id,
        label: issued.client.clientId,
      },
      tenantId: issued.client.tenantId,
      resourceType: 'api_client',
      resourceId: issued.client.uid,
      ctx: request.ctx,
    })

    return serialize({
      accessToken: issued.value,
      tokenType: 'Bearer',
      expiresAt: issued.token.expiresAt,
      abilities: issued.token.abilities,
    })
  }

  /**
   * Revokes the token used to make this call. A tenant that suspects a leak
   * can burn a credential without waiting for an operator.
   */
  async destroy({ apiClient, serialize }: HttpContext) {
    if (apiClient.currentAccessToken) {
      await ApiClient.accessTokens.delete(apiClient, apiClient.currentAccessToken.identifier)

      await AuditService.record({
        action: AuditAction.TOKEN_REVOKED,
        actor: { type: ActorType.API_CLIENT, id: apiClient.id, label: apiClient.clientId },
        tenantId: apiClient.tenantId,
        resourceType: 'api_client',
        resourceId: apiClient.uid,
      })
    }

    return serialize({ revoked: true })
  }
}
