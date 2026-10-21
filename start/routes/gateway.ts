/*
|--------------------------------------------------------------------------
| Gateway routes
|--------------------------------------------------------------------------
|
| The surface Android devices talk to. Kept under its own prefix and its own
| guard so a device credential can never reach the tenant API, and so the two
| can be firewalled separately if they ever need to be.
|
| The realtime channel lives at the WebSocket path in config/gateway.ts; these
| endpoints cover onboarding and the offline fallback.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'

router
  .group(() => {
    /**
     * Open by necessity: a new device has no credential yet. Registering
     * grants nothing on its own; the device carries no traffic until it is
     * assigned.
     */
    router
      .post('register', [controllers.gateways.GatewayRegistration, 'store'])
      .as('gateway.register')

    router
      .group(() => {
        router
          .get('provision', [controllers.gateways.GatewayProvision, 'show'])
          .as('gateway.provision')

        router
          .post('sim-profiles', [controllers.gateways.GatewayProvision, 'syncSims'])
          .as('gateway.sims.sync')

        router
          .post('results', [controllers.gateways.GatewayProvision, 'reportResults'])
          .as('gateway.results')
      })
      .use(middleware.gatewayAuth())
  })
  .prefix('/api/v1/gw')
