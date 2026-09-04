import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'api_clients'

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

      table.string('name').notNullable()

      /**
       * The public half of the credentials pair. Sent by the tenant backend
       * to /auth/token together with the secret.
       */
      table.string('client_id', 64).notNullable().unique()
      table.string('client_secret_hash').notNullable()

      /**
       * Abilities granted to every token issued for this client,
       * e.g. ["sms:send", "sms:read"].
       */
      table.jsonb('abilities').notNullable().defaultTo('[]')

      table.integer('rate_limit_per_min').notNullable().defaultTo(60)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('last_used_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['tenant_id'], 'api_clients_tenant_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
