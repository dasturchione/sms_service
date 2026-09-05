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
          .post('batch', [controllers.sms.Sms, 'storeBatch'])
          .as('sms.batch')
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

    /**
     * Aggregated numbers about the tenant's own traffic.
     */
    router
      .group(() => {
        router.get('daily', [controllers.reports.Reports, 'daily']).as('reports.daily')
        router.get('summary', [controllers.reports.Reports, 'summary']).as('reports.summary')
      })
      .prefix('reports')
      .use(middleware.clientAuth())
      .use(middleware.abilities([ClientAbility.REPORT_READ]))

    /**
     * Credit behind the tenant's own devices.
     */
    router
      .get('balances', [controllers.Balances, 'index'])
      .as('balances.index')
      .use(middleware.clientAuth())
      .use(middleware.abilities([ClientAbility.BALANCE_READ]))

    /**
     * Where a tenant says how it wants to hear about its own traffic.
     */
    router
      .group(() => {
        router.get('/', [controllers.webhooks.WebhookEndpoints, 'index']).as('webhooks.index')
        router.post('/', [controllers.webhooks.WebhookEndpoints, 'store']).as('webhooks.store')
        router.get(':uid', [controllers.webhooks.WebhookEndpoints, 'show']).as('webhooks.show')
        router
          .patch(':uid', [controllers.webhooks.WebhookEndpoints, 'update'])
          .as('webhooks.update')
        router
          .delete(':uid', [controllers.webhooks.WebhookEndpoints, 'destroy'])
          .as('webhooks.destroy')
      })
      .prefix('webhooks')
      .use(middleware.clientAuth())
      .use(middleware.abilities([ClientAbility.WEBHOOK_MANAGE]))

    router
      .post('auth/token/revoke', [controllers.auth.ClientTokens, 'destroy'])
      .as('client.token.destroy')
      .use(middleware.clientAuth())
  })
  .prefix('/api/v1')
