import { defineConfig } from '@adonisjs/auth'
import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'

/**
 * Three authentication contexts that never overlap:
 *
 * - `api`  / `web`  humans operating the platform
 * - `client`        tenant backends calling the public API
 * - `gateway`       Android devices carrying the traffic
 *
 * Each has its own tokenable model and its own token table, so a leaked
 * device credential cannot be replayed against the tenant API and vice versa.
 */
const authConfig = defineConfig({
  /**
   * Default guard used when no guard is explicitly specified.
   */
  default: 'api',

  guards: {
    /**
     * Token-based guard for stateless API authentication.
     */
    api: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/user'),
      }),
    }),

    /**
     * Session-based guard for browser authentication.
     */
    web: sessionGuard({
      /**
       * Enable persistent login using remember-me tokens.
       */
      useRememberMeTokens: false,

      provider: sessionUserProvider({
        model: () => import('#models/user'),
      }),
    }),

    /**
     * Machine-to-machine guard used by tenant backends.
     */
    client: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/api_client'),
      }),
    }),

    /**
     * Device guard used by the Android gateways over both HTTP and the
     * WebSocket handshake.
     */
    gateway: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/gateway'),
      }),
    }),
  },
})

export default authConfig

/**
 * Inferring types from the configured auth
 * guards.
 */
declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
