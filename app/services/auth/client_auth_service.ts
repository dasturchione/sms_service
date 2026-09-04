import hash from '@adonisjs/core/services/hash'
import { safeTiming } from '@adonisjs/core/helpers'
import { errors as authErrors } from '@adonisjs/auth'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { DateTime } from 'luxon'
import ApiClient from '#models/api_client'
import Tenant from '#models/tenant'
import { TenantSuspendedException } from '#exceptions/domain_exception'
import DomainException from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'

/**
 * Floor for credential verification. Every outcome takes at least this long,
 * so response time cannot distinguish an unknown client id from a wrong
 * secret.
 */
const MINIMUM_VERIFY_MS = 200

export type IssuedToken = {
  client: ApiClient
  token: AccessToken
  value: string
}

/**
 * Exchanges client credentials for an access token.
 *
 * Opaque tokens are used rather than JWTs because the platform must be able to
 * revoke a credential the moment a tenant reports a leak, and must record when
 * each credential was last used. A signed JWT can do neither without a
 * server-side lookup, which removes the only reason to prefer it.
 */
export default class ClientAuthService {
  /**
   * Verifies credentials and issues a token.
   *
   * Both the "no such client" and the "wrong secret" paths take the same
   * amount of time, so the response cannot be used to enumerate client ids.
   */
  static async issueToken(clientId: string, clientSecret: string): Promise<IssuedToken> {
    const client = await safeTiming<ApiClient | null>(MINIMUM_VERIFY_MS, async () => {
      const candidate = await ApiClient.findBy('clientId', clientId)
      if (!candidate) {
        return null
      }

      const matches = await hash.verify(candidate.clientSecretHash, clientSecret)
      return matches ? candidate : null
    })

    if (!client) {
      throw new authErrors.E_UNAUTHORIZED_ACCESS('Invalid client credentials', {
        guardDriverName: 'client',
      })
    }

    if (!client.isActive) {
      throw new DomainException(ErrorCode.CLIENT_DISABLED, 'This API client has been disabled', {
        status: 403,
      })
    }

    const tenant = await Tenant.find(client.tenantId)
    if (!tenant || !tenant.isUsable) {
      throw new TenantSuspendedException()
    }

    /**
     * A token can never carry more than its client was granted, so shrinking
     * a client's abilities immediately narrows every token it issues next.
     */
    const token = await ApiClient.accessTokens.create(client, client.abilities, {
      name: `client:${client.clientId}`,
    })

    client.lastUsedAt = DateTime.now()
    await client.save()

    return { client, token, value: token.value!.release() }
  }
}
