import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The daily allowance of distinct recipients per SIM.
 *
 * Operators sell "unlimited" tariffs that are unlimited in volume but capped in
 * reach: a SIM may message only so many different numbers per day (60 at the
 * time of writing), however many messages each of them gets. Going past the
 * cap gets the SIM blocked.
 *
 * This is a ledger, not a cache of `sms_messages`. The question it answers has
 * to be settled atomically before a send ("may this SIM take this number
 * today?"), and a unique index answers it in one statement regardless of how
 * many messages are in flight. Deriving it from messages would rely on a
 * serialisation that only holds while `max_in_flight` is 1, and would lose the
 * history of failed attempts, whose `sim_profile_id` is cleared on retry.
 */
export default class extends BaseSchema {
  protected tableName = 'sim_daily_recipients'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table
        .integer('sim_profile_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('sim_profiles')
        .onDelete('CASCADE')

      /**
       * The operator's day, in the billing timezone rather than UTC. Rolling
       * over to a new date is what resets the allowance; nothing deletes rows
       * at midnight.
       */
      table.date('usage_date').notNullable()
      table.string('recipient_normalized', 20).notNullable()

      table
        .bigInteger('first_message_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sms_messages')
        .onDelete('SET NULL')

      /**
       * Messages that actually left the device for this number today. Zero
       * means the slot was claimed but nothing reached the network, which is
       * what allows a failed attempt to hand its slot back.
       */
      table.integer('messages_sent').notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['sim_profile_id', 'usage_date', 'recipient_normalized'])
      table.index(['sim_profile_id', 'usage_date'], 'sim_daily_recipients_sim_date_index')
      table.index(['usage_date', 'recipient_normalized'], 'sim_daily_recipients_recipient_index')
    })

    this.schema.alterTable('operators', (table) => {
      /**
       * Distinct recipients a SIM of this operator may reach per day. The cap
       * comes from the tariff, so it lives with the operator. Null means no
       * cap.
       */
      table.integer('daily_recipient_limit').nullable().defaultTo(60)
    })

    this.schema.alterTable('sim_profiles', (table) => {
      /**
       * Override for one SIM, e.g. a different tariff. Null inherits from the
       * operator.
       */
      table.integer('daily_recipient_limit').nullable()
    })
  }

  async down() {
    this.schema.alterTable('sim_profiles', (table) => {
      table.dropColumn('daily_recipient_limit')
    })
    this.schema.alterTable('operators', (table) => {
      table.dropColumn('daily_recipient_limit')
    })
    this.schema.dropTable(this.tableName)
  }
}
