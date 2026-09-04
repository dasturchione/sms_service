/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| Route definitions are split by audience rather than by resource, because the
| three audiences authenticate differently and must never share middleware by
| accident:
|
|   client   tenant backends, `client` guard, tenant scoped
|   gateway  Android devices,  `gateway` guard
|   admin    platform operators, `api` / `web` guards
|
*/

import router from '@adonisjs/core/services/router'

import '#start/routes/client'
import '#start/routes/gateway'
import '#start/routes/admin'

/**
 * Liveness probe. Deliberately does not touch the database, so it answers
 * even while a dependency is down; readiness lands with the metrics work.
 */
router.get('/', () => {
  return { status: 'ok' }
})
