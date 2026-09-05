/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Database
  DB_CONNECTION: Env.schema.enum(['sqlite', 'mysql', 'pg', 'mssql', 'libsql'] as const),
  DB_HOST: Env.schema.string.optional({ format: 'host' }),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  // Gateway node
  /**
   * Identifies this instance among several. Defaults to hostname and pid,
   * which is right for a single box and wrong the moment you run two.
   */
  NODE_ID: Env.schema.string.optional(),

  /**
   * Whether this instance serves device sockets and dispatches messages.
   * A plain API instance behind a load balancer should set this to false.
   */
  GATEWAY_NODE_ENABLED: Env.schema.boolean.optional(),

  // Background jobs
  /**
   * Whether this instance drains the job queues. Unrelated to the gateway
   * role: webhook delivery is stateless and can run on any instance.
   */
  WORKER_ENABLED: Env.schema.boolean.optional(),

  /**
   * How long a tenant's webhook receiver has to answer before the delivery is
   * treated as failed and retried.
   */
  WEBHOOK_TIMEOUT_MS: Env.schema.number.optional(),

  // Monitoring
  /**
   * Bearer token guarding `/metrics`. Unset leaves the endpoint open, which is
   * fine only when it is not reachable from outside the cluster.
   */
  METRICS_TOKEN: Env.schema.string.optional(),
})
