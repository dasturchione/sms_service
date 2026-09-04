import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A routing endpoint. One physical phone (gateway) exposes one profile per
 * SIM slot, so a dual SIM device is two independent routes.
 */
export default class extends BaseSchema {
  protected tableName = 'sim_profiles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('uid', 40).notNullable().unique()
      table
        .integer('gateway_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('gateways')
        .onDelete('CASCADE')
      table
        .integer('operator_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('operators')
        .onDelete('SET NULL')

      table.integer('slot').notNullable()
      table.string('label').nullable()
      table.string('phone_number', 20).nullable()

      /**
       * Hashed so a leaked database dump does not expose subscriber
       * identifiers, while still allowing us to detect a swapped SIM.
       */
      table.string('imsi_hash', 64).nullable()
      table.string('iccid_hash', 64).nullable()

      /**
       * Android throttles outgoing SMS per app, so this stays deliberately
       * low. See docs/ARCHITECTURE.md section 9.
       */
      table.integer('sms_per_minute').notNullable().defaultTo(1)
      table.integer('daily_quota').nullable()
      table.integer('sent_today').notNullable().defaultTo(0)
      table.date('counter_date').nullable()

      /**
       * Null means unknown, which the selector treats as "no obstacle"
       * rather than "empty".
       */
      table.integer('sms_balance').nullable()
      table.timestamp('balance_checked_at').nullable()
      table.integer('balance_check_interval_min').notNullable().defaultTo(60)

      /**
       * ready | absent | locked | no_service | unknown
       */
      table.string('state', 20).notNullable().defaultTo('unknown')
      table.boolean('is_active').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['gateway_id', 'slot'])
      table.index(['operator_id', 'is_active'], 'sim_profiles_operator_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
