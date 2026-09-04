import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The dispatcher runs one hot query: "the highest priority message that is due
 * now". A partial index keeps it reading only the queue, not the archive of
 * everything ever sent.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE INDEX sms_messages_dispatch_index
      ON sms_messages (priority, next_attempt_at NULLS FIRST, id)
      WHERE status = 'queued'
    `)

    /**
     * Sweeps for leases that ran out. Also partial, because only a handful of
     * messages are in flight at any moment.
     */
    this.schema.raw(`
      CREATE INDEX sms_messages_inflight_index
      ON sms_messages (lease_expires_at)
      WHERE status IN ('assigned', 'sending')
    `)

    /**
     * Counts messages currently outstanding on a device.
     */
    this.schema.raw(`
      CREATE INDEX sms_messages_sim_inflight_index
      ON sms_messages (sim_profile_id)
      WHERE status IN ('assigned', 'sending')
    `)
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS sms_messages_sim_inflight_index')
    this.schema.raw('DROP INDEX IF EXISTS sms_messages_inflight_index')
    this.schema.raw('DROP INDEX IF EXISTS sms_messages_dispatch_index')
  }
}
