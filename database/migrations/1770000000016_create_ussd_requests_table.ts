import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ussd_requests'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table.string('uid', 40).notNullable().unique()
      table
        .integer('sim_profile_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('sim_profiles')
        .onDelete('CASCADE')

      table.string('kind', 32).notNullable()
      table.string('command', 32).notNullable()
      table.jsonb('steps').notNullable().defaultTo('[]')

      /**
       * queued | sending | success | failed | unsupported
       */
      table.string('status', 16).notNullable().defaultTo('queued')
      table.text('raw_response').nullable()
      table.jsonb('parsed').nullable()
      table.string('error_code', 48).nullable()
      table.text('error_message').nullable()

      table.timestamp('requested_at').notNullable()
      table.timestamp('completed_at').nullable()

      table.index(['sim_profile_id', 'requested_at'], 'ussd_requests_sim_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
