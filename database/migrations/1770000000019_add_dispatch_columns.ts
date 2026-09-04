import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Columns the dispatcher needs to treat `sms_messages` itself as the queue,
 * instead of mirroring every message into a separate job store.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('sms_messages', (table) => {
      /**
       * When this message becomes eligible again. Set into the future by the
       * retry policy so a failed message backs off instead of spinning.
       */
      table.timestamp('next_attempt_at').nullable()
    })

    this.schema.alterTable('sim_profiles', (table) => {
      /**
       * Pacing rather than bursting: after each assignment this is pushed
       * forward by 60/sms_per_minute seconds. Even spacing is what keeps a
       * device under Android's outgoing SMS throttle.
       */
      table.timestamp('next_available_at').nullable()
    })

    this.schema.alterTable('gateways', (table) => {
      /**
       * How many messages may be outstanding on this device at once. One is
       * the safe default: a phone sends serially anyway.
       */
      table.integer('max_in_flight').notNullable().defaultTo(1)

      /**
       * Which application instance currently holds this device's socket.
       * Cleared on disconnect. Lets a dispatcher on another node hand the job
       * to the node that can actually deliver it.
       */
      table.string('node_id', 64).nullable()
    })
  }

  async down() {
    this.schema.alterTable('gateways', (table) => {
      table.dropColumn('node_id')
      table.dropColumn('max_in_flight')
    })
    this.schema.alterTable('sim_profiles', (table) => {
      table.dropColumn('next_available_at')
    })
    this.schema.alterTable('sms_messages', (table) => {
      table.dropColumn('next_attempt_at')
    })
  }
}
