import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per WebSocket connection. Uptime and flap detection are derived
 * from this table.
 */
export default class extends BaseSchema {
  protected tableName = 'gateway_sessions'

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

      /**
       * Which application instance holds the socket. Used to route a job to
       * the right process when running more than one node.
       */
      table.string('node_id', 64).notNullable()

      table.timestamp('connected_at').notNullable()
      table.timestamp('disconnected_at').nullable()
      table.string('disconnect_reason', 64).nullable()
      table.string('ip_address', 45).nullable()
      table.string('app_version', 32).nullable()

      table.index(['gateway_id', 'connected_at'], 'gateway_sessions_gateway_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
