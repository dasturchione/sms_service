import lucid from '@adonisjs/lucid/services/db'

/**
 * Direct query builder access for tests that need to set up a state the API
 * deliberately does not expose, such as moving a lease into the past.
 */
export function db() {
  return lucid
}
