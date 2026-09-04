import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table
        .integer('tenant_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('tenants')
        .onDelete('SET NULL')

      /**
       * user | api_client | gateway | system
       */
      table.string('actor_type', 16).notNullable()
      table.integer('actor_id').unsigned().nullable()
      table.string('actor_label').nullable()

      table.string('action', 64).notNullable()
      table.string('resource_type', 32).nullable()
      table.string('resource_id', 64).nullable()

      table.string('ip_address', 45).nullable()
      table.string('user_agent', 255).nullable()
      table.jsonb('metadata').nullable()

      table.timestamp('created_at').notNullable()

      table.index(['tenant_id', 'created_at'], 'audit_logs_tenant_created_index')
      table.index(['action', 'created_at'], 'audit_logs_action_created_index')
      table.index(['resource_type', 'resource_id'], 'audit_logs_resource_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
