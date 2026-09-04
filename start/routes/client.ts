/*
|--------------------------------------------------------------------------
| Client API routes
|--------------------------------------------------------------------------
|
| The public surface tenant backends integrate against. Everything past the
| token exchange runs behind `clientAuth`, which authenticates the caller and
| pins the request to its tenant in one step, plus an explicit ability check
| per route.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import { ClientAbility } from '#enums/ability'

router
  .group(() => {
    /**
     * Credential exchange. Unauthenticated by definition.
     */
    router.post('auth/token', [controllers.auth.ClientTokens, 'store']).as('client.token.store')

    router
      .group(() => {
        router
          .post('/', [controllers.sms.Sms, 'store'])
          .as('sms.store')
          .use(middleware.abilities([ClientAbility.SMS_SEND]))

        router
          .get('/', [controllers.sms.Sms, 'index'])
          .as('sms.index')
          .use(middleware.abilities([ClientAbility.SMS_READ]))

        router
          .get(':uid', [controllers.sms.Sms, 'show'])
          .as('sms.show')
          .use(middleware.abilities([ClientAbility.SMS_READ]))

        router
          .post(':uid/cancel', [controllers.sms.Sms, 'cancel'])
          .as('sms.cancel')
          .use(middleware.abilities([ClientAbility.SMS_CANCEL]))
      })
      .prefix('sms')
      .use(middleware.clientAuth())

    router
      .post('auth/token/revoke', [controllers.auth.ClientTokens, 'destroy'])
      .as('client.token.destroy')
      .use(middleware.clientAuth())
  })
  .prefix('/api/v1')
