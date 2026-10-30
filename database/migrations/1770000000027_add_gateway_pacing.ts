import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A per-device send rate, and no daily recipient cap unless one is set.
 *
 * SIM pacing alone could not express "this phone sends at most N a minute":
 * a dual-SIM phone paced at N per SIM sends 2N. The device rate is a second
 * window on top of the SIM's, so whichever is tighter wins.
 *
 * The recipient cap used to default to 60 for every operator. It is now off
 * until someone sets it, on the operator or on one SIM.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('gateways', (table) => {
      /** Messages per minute across all of this device's SIMs. Null: no device cap. */
      table.integer('sms_per_minute').nullable()

      /** When the device may take its next message, if it has a rate. */
      table.timestamp('next_available_at').nullable()
    })

    this.schema.alterTable('operators', (table) => {
      table.integer('daily_recipient_limit').nullable().defaultTo(null).alter()
    })

    /**
     * 60 was the seeded default, not a choice anyone made per operator.
     */
    this.defer(async (db) => {
      await db.from('operators').where('daily_recipient_limit', 60).update({
        daily_recipient_limit: null,
      })
    })
  }

  async down() {
    this.schema.alterTable('operators', (table) => {
      table.integer('daily_recipient_limit').nullable().defaultTo(60).alter()
    })

    this.schema.alterTable('gateways', (table) => {
      table.dropColumn('sms_per_minute')
      table.dropColumn('next_available_at')
    })
  }
}
