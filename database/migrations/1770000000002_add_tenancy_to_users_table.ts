import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('uid', 40).nullable().unique()

      /**
       * A null tenant means a platform operator that can see every tenant.
       */
      table
        .integer('tenant_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')

      /**
       * owner | admin | operator | viewer
       */
      table.string('role', 20).notNullable().defaultTo('owner')
      table.boolean('is_active').notNullable().defaultTo(true)

      table.index(['tenant_id'], 'users_tenant_id_index')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['tenant_id'], 'users_tenant_id_index')
      table.dropColumn('is_active')
      table.dropColumn('role')
      table.dropColumn('tenant_id')
      table.dropColumn('uid')
    })
  }
}
