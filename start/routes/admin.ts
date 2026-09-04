/*
|--------------------------------------------------------------------------
| Admin routes
|--------------------------------------------------------------------------
|
| Endpoints for humans operating the platform: signing in, and from M6 the
| admin panel. Authenticated with the `api` guard against the `users` table.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())

    /**
     * Fleet management. Restricted to platform operators inside the
     * controller, since the check is about who the user is rather than which
     * route they hit.
     */
    router
      .group(() => {
        router.get('/', [controllers.admin.Gateways, 'index']).as('admin.gateways.index')
        router.get(':uid', [controllers.admin.Gateways, 'show']).as('admin.gateways.show')
        router
          .post(':uid/approve', [controllers.admin.Gateways, 'approve'])
          .as('admin.gateways.approve')
        router
          .post(':uid/disable', [controllers.admin.Gateways, 'disable'])
          .as('admin.gateways.disable')
      })
      .prefix('admin/gateways')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
