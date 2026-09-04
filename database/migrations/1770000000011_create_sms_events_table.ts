import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Append only trace of every state change of a message. This is the first
 * thing anyone looks at when a customer asks "where did my SMS go".
 */
export default class extends BaseSchema {
  protected tableName = 'sms_events'

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

      table.string('event', 32).notNullable()
      table
        .integer('gateway_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('gateways')
        .onDelete('SET NULL')
      table.jsonb('payload').nullable()

      table.timestamp('created_at').notNullable()

      table.index(['sms_message_id', 'id'], 'sms_events_message_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
