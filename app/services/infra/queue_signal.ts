import pg from 'pg'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

/**
 * Postgres channel the dispatcher listens on. Channel names are identifiers,
 * so this must stay a plain lowercase word.
 */
const CHANNEL = 'sms_queued'

/**
 * Wakes the dispatcher the moment work appears.
 *
 * Polling alone would work but would trade latency for load: a two second poll
 * means a two second delay on every one time code. `NOTIFY` removes that
 * without adding a broker.
 *
 * Notifications are explicitly *not* durable: one sent while nobody is
 * listening is simply lost. That is why the dispatcher also polls on an
 * interval. The notification is an optimisation; the poll is the guarantee.
 */
export default class QueueSignal {
  /**
   * Announces that a message is ready. Never throws: failing to speed up
   * dispatch must not fail the request that accepted the message.
   */
  static async notify(): Promise<void> {
    try {
      await db.rawQuery(`NOTIFY ${CHANNEL}`)
    } catch (error) {
      logger.debug({ err: error }, 'failed to publish queue notification')
    }
  }

  /**
   * Opens a dedicated connection and calls `onSignal` for each notification.
   *
   * A listening connection cannot be shared with the pool: it is blocked on the
   * server side for the lifetime of the LISTEN, and handing it back to the pool
   * would leak that state into unrelated queries.
   */
  static async listen(onSignal: () => void): Promise<() => Promise<void>> {
    const client = new pg.Client({
      host: env.get('DB_HOST'),
      port: env.get('DB_PORT'),
      user: env.get('DB_USER'),
      password: env.get('DB_PASSWORD'),
      database: env.get('DB_DATABASE'),
    })

    let stopped = false

    client.on('notification', (message) => {
      if (message.channel === CHANNEL) onSignal()
    })

    /**
     * A dropped listener is silent by nature: no error surfaces until work
     * quietly stops being picked up promptly. Reconnecting keeps the
     * optimisation alive; the poll keeps correctness in the meantime.
     */
    client.on('error', (error) => {
      logger.warn({ err: error }, 'queue notification connection failed')
      if (stopped) return

      setTimeout(() => {
        if (!stopped) {
          this.listen(onSignal).catch(() => {})
        }
      }, 5000)
    })

    await client.connect()
    await client.query(`LISTEN ${CHANNEL}`)

    logger.info('listening for queue notifications')

    return async () => {
      stopped = true
      try {
        await client.end()
      } catch {
        /* the connection is going away regardless */
      }
    }
  }
}
