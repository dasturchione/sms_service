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
import { controllers } from '#generated/controllers'

import '#start/routes/client'
import '#start/routes/gateway'
import '#start/routes/admin'

/**
 * Operational endpoints. Outside `/api/v1` on purpose: they are not part of
 * the tenant API, they are not versioned with it, and they must stay reachable
 * when it is not.
 */
router.get('/', [controllers.Health, 'live']).as('root')
router.get('/health', [controllers.Health, 'live']).as('health.live')
router.get('/health/ready', [controllers.Health, 'ready']).as('health.ready')
router.get('/metrics', [controllers.Health, 'metrics']).as('health.metrics')
