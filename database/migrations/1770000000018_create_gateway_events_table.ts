import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table
        .integer('gateway_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('gateways')
        .onDelete('CASCADE')

      table.string('event', 48).notNullable()
      table.string('severity', 16).notNullable().defaultTo('info')
      table.jsonb('payload').nullable()

      table.timestamp('created_at').notNullable()

      table.index(['gateway_id', 'created_at'], 'gateway_events_gateway_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
