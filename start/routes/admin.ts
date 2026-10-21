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
        /**
         * Sign in only. There is deliberately no self-signup: an account here
         * can approve gateways and issue credentials that spend money on the
         * platform's SIMs, so accounts are handed out by an existing operator
         * through the back office, or bootstrapped on the server with
         * `node ace staff:create`.
         */
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
     * The back office. Everything below is staff only, enforced by the group's
     * guard rather than by each controller, so a route added later inherits it
     * instead of relying on someone remembering.
     */
    router
      .group(() => {
        router.get('overview', [controllers.admin.Overview, 'show']).as('admin.overview')

        router.get('tenants', [controllers.admin.Tenants, 'index']).as('admin.tenants.index')
        router.post('tenants', [controllers.admin.Tenants, 'store']).as('admin.tenants.store')
        router.get('tenants/:uid', [controllers.admin.Tenants, 'show']).as('admin.tenants.show')
        router
          .patch('tenants/:uid', [controllers.admin.Tenants, 'update'])
          .as('admin.tenants.update')

        router
          .get('tenants/:uid/clients', [controllers.admin.Tenants, 'indexClients'])
          .as('admin.clients.index')
        router
          .post('tenants/:uid/clients', [controllers.admin.Tenants, 'storeClient'])
          .as('admin.clients.store')
        router
          .patch('tenants/:uid/clients/:clientUid', [controllers.admin.Tenants, 'updateClient'])
          .as('admin.clients.update')
        router
          .post('tenants/:uid/clients/:clientUid/rotate-secret', [
            controllers.admin.Tenants,
            'rotateClientSecret',
          ])
          .as('admin.clients.rotate_secret')

        router
          .get('tenants/:uid/webhooks', [controllers.admin.Tenants, 'indexWebhooks'])
          .as('admin.webhooks.index')

        /**
         * Traffic over time. No tenant means the whole platform.
         */
        router.get('reports/daily', [controllers.admin.Reports, 'daily']).as('admin.reports.daily')

        /**
         * The platform's own staff.
         */
        router.get('staff', [controllers.admin.Staff, 'index']).as('admin.staff.index')
        router.post('staff', [controllers.admin.Staff, 'store']).as('admin.staff.store')
        router.patch('staff/:uid', [controllers.admin.Staff, 'update']).as('admin.staff.update')

        /**
         * Read-only support views.
         */
        router.get('messages', [controllers.admin.Explorer, 'messages']).as('admin.messages.index')
        router
          .get('messages/:uid', [controllers.admin.Explorer, 'message'])
          .as('admin.messages.show')
        router
          .post('messages/:uid/cancel', [controllers.admin.Explorer, 'cancelMessage'])
          .as('admin.messages.cancel')

        router.get('audit', [controllers.admin.Explorer, 'audit']).as('admin.audit.index')

        /**
         * Each SIM's daily allowance of distinct recipients: how much is used
         * and which numbers it is serving today.
         */
        router
          .get('allowances', [controllers.admin.Allowances, 'index'])
          .as('admin.allowances.index')
        router
          .get('allowances/:simUid', [controllers.admin.Allowances, 'show'])
          .as('admin.allowances.show')

        /**
         * The background queue. A webhook that exhausted its attempts surfaces
         * nowhere else.
         */
        router.get('jobs', [controllers.admin.Jobs, 'index']).as('admin.jobs.index')
        router.post('jobs/:id/retry', [controllers.admin.Jobs, 'retry']).as('admin.jobs.retry')
        router.delete('jobs/:id', [controllers.admin.Jobs, 'destroy']).as('admin.jobs.destroy')
      })
      .prefix('admin')
      .use(middleware.platformAdmin())

    /**
     * Fleet management. Restricted to platform operators inside the
     * controller, since the check is about who the user is rather than which
     * route they hit.
     */
    router
      .group(() => {
        router.get('/', [controllers.admin.Gateways, 'index']).as('admin.gateways.index')
        router.get(':uid', [controllers.admin.Gateways, 'show']).as('admin.gateways.show')
        router.patch(':uid', [controllers.admin.Gateways, 'update']).as('admin.gateways.update')
        router
          .get(':uid/diagnostics', [controllers.admin.Fleet, 'diagnostics'])
          .as('admin.gateways.diagnostics')
        router
          .post(':uid/enable', [controllers.admin.Gateways, 'enable'])
          .as('admin.gateways.enable')
        router
          .post(':uid/disable', [controllers.admin.Gateways, 'disable'])
          .as('admin.gateways.disable')
        router.delete(':uid', [controllers.admin.Gateways, 'destroy']).as('admin.gateways.destroy')
      })
      .prefix('admin/gateways')
      .use(middleware.platformAdmin())

    /**
     * Operators and their USSD codes. Operators change these without notice,
     * so editing a row has to be enough — no redeploy, no APK rollout.
     */
    router
      .group(() => {
        router.get('/', [controllers.admin.Operators, 'index']).as('admin.operators.index')
        router.post('/', [controllers.admin.Operators, 'store']).as('admin.operators.store')
        router.get(':code', [controllers.admin.Operators, 'show']).as('admin.operators.show')
        router.patch(':code', [controllers.admin.Operators, 'update']).as('admin.operators.update')

        router
          .put(':code/ussd', [controllers.admin.Operators, 'upsertUssdCommand'])
          .as('admin.operators.ussd.upsert')

        router
          .delete(':code/ussd/:kind', [controllers.admin.Operators, 'destroyUssdCommand'])
          .as('admin.operators.ussd.destroy')
      })
      .prefix('admin/operators')
      .use(middleware.platformAdmin())

    /**
     * Dialling a code on a real SIM: how a changed code is verified.
     */
    router
      .group(() => {
        router.patch('sims/:uid', [controllers.admin.Fleet, 'updateSim']).as('admin.sims.update')

        router.post('sims/:uid/ussd', [controllers.admin.Operators, 'runUssd']).as('admin.ussd.run')

        router.get('ussd/:uid', [controllers.admin.Operators, 'showUssd']).as('admin.ussd.show')
      })
      .prefix('admin')
      .use(middleware.platformAdmin())
  })
  .prefix('/api/v1')
