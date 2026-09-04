import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { authApiClient } from '@adonisjs/auth/plugins/api_client'
import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
import type { Registry } from '../.adonisjs/client/registry/schema.d.ts'

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */
declare module '@japa/api-client/types' {
  interface RoutesRegistry extends Registry {}
}

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */

/**
 * Configure Japa plugins in the plugins array.
 * Learn more - https://japa.dev/docs/runner-config#plugins-optional
 */
export const plugins: Config['plugins'] = [
  assert(),
  pluginAdonisJS(app),
  dbAssertions(app),
  apiClient(),
  sessionApiClient(app),
  authApiClient(app),
]

/**
 * Configure lifecycle function to run before and after all the
 * tests.
 *
 * The setup functions are executed before all the tests
 * The teardown functions are executed after all the tests
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  /**
   * Bring the dedicated test database up to date once per run, rather than
   * per suite, so a schema change never has to be applied by hand.
   */
  setup: [() => testUtils.db().migrate()],
  teardown: [],
}

/**
 * Configure suites by tapping into the test suite instance.
 * Learn more - https://japa.dev/docs/test-suites#lifecycle-hooks
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (['browser', 'functional', 'e2e'].includes(suite.name)) {
    suite.setup(() => testUtils.httpServer().start())

    /**
     * Emptied between tests, not merely between suites.
     *
     * The dispatcher works off a global queue rather than a per-tenant one, so
     * a message another test left behind would be picked up here and quietly
     * invalidate the assertions.
     */
    const truncate = () => testUtils.db().truncate()

    /**
     * Both hooks are needed: `onTest` sees only tests declared at the top level
     * of a file, while tests inside a `test.group` are reached through the
     * group. Registering just one of them silently leaves half the suite
     * sharing state.
     */
    suite.onTest((testCase) => testCase.setup(truncate))
    suite.onGroup((group) => group.each.setup(truncate))

    return suite
  }
}
