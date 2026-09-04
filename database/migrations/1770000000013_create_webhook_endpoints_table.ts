import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'webhook_endpoints'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('uid', 40).notNullable().unique()
      table
        .integer('tenant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')

      table.string('url', 512).notNullable()

      /**
       * Shared secret used to sign the payload (HMAC SHA256) so the tenant can
       * verify the call really came from us.
       */
      table.string('secret', 128).notNullable()

      /**
       * e.g. ["sms.sent", "sms.failed", "sms.delivered", "gateway.offline"]
       */
      table.jsonb('events').notNullable().defaultTo('[]')

      table.boolean('is_active').notNullable().defaultTo(true)

      /**
       * Consecutive failures. The endpoint is auto disabled once it keeps
       * rejecting deliveries, to stop the queue from filling up.
       */
      table.integer('failure_count').notNullable().defaultTo(0)
      table.timestamp('last_success_at').nullable()
      table.timestamp('last_failure_at').nullable()
      table.timestamp('disabled_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['tenant_id', 'is_active'], 'webhook_endpoints_tenant_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
