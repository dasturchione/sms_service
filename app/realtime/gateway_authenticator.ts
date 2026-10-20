import type { IncomingMessage } from 'node:http'
import { Secret } from '@adonisjs/core/helpers'
import Gateway from '#models/gateway'
import { GatewayStatus } from '#enums/gateway_status'
import { GatewayAbility } from '#enums/ability'

export type AuthOutcome =
  { ok: true; gateway: Gateway } | { ok: false; code: number; reason: string }

/**
 * Authenticates a WebSocket upgrade.
 *
 * The handshake carries the same device token the HTTP gateway endpoints use.
 * It is preferred in the `Authorization` header, because a token in a query
 * string ends up in access logs and proxy history; the query fallback exists
 * only for clients that cannot set headers on an upgrade.
 */
export default class GatewayAuthenticator {
  static async authenticate(request: IncomingMessage): Promise<AuthOutcome> {
    const token = this.extractToken(request)

    if (!token) {
      return { ok: false, code: 4401, reason: 'missing credentials' }
    }

    const accessToken = await Gateway.accessTokens.verify(new Secret(token))
    if (!accessToken) {
      return { ok: false, code: 4401, reason: 'invalid credentials' }
    }

    if (!accessToken.allows(GatewayAbility.CONNECT)) {
      return { ok: false, code: 4403, reason: 'token may not open a session' }
    }

    const gateway = await Gateway.find(accessToken.tokenableId)
    if (!gateway) {
      return { ok: false, code: 4401, reason: 'unknown device' }
    }

    /**
     * Re-checked on every connection rather than once, so disabling a device
     * takes effect on its next reconnect. Disabling keeps the token, which is
     * what lets an operator enable the phone again without touching it; this
     * check is what makes the token useless in between.
     */
    if (!gateway.isActive || gateway.status === GatewayStatus.DISABLED) {
      return { ok: false, code: 4403, reason: 'device disabled' }
    }

    gateway.currentAccessToken = accessToken
    return { ok: true, gateway }
  }

  private static extractToken(request: IncomingMessage): string | null {
    const header = request.headers.authorization
    if (header?.startsWith('Bearer ')) {
      return header.slice(7).trim() || null
    }

    const url = new URL(request.url ?? '/', 'http://localhost')
    return url.searchParams.get('token')
  }
}
