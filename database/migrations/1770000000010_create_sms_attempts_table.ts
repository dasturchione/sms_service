import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per delivery attempt. Lets the selector avoid a SIM that already
 * failed for this message and makes per device success rates measurable.
 */
export default class extends BaseSchema {
  protected tableName = 'sms_attempts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table
        .bigInteger('sms_message_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('sms_messages')
        .onDelete('CASCADE')

      table.integer('attempt_no').notNullable()
      table
        .integer('sim_profile_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sim_profiles')
        .onDelete('SET NULL')
      table
        .integer('gateway_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('gateways')
        .onDelete('SET NULL')

      /**
       * assigned | sending | sent | failed | timed_out
       */
      table.string('status', 16).notNullable()
      table.string('error_code', 48).nullable()
      table.text('error_message').nullable()

      table.timestamp('started_at').notNullable()
      table.timestamp('finished_at').nullable()
      table.integer('duration_ms').nullable()

      table.unique(['sms_message_id', 'attempt_no'])
      table.index(['sim_profile_id', 'started_at'], 'sms_attempts_sim_started_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
