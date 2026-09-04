import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tenants'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('uid', 40).notNullable().unique()
      table.string('name').notNullable()
      table.string('slug', 64).notNullable().unique()

      /**
       * active | suspended | archived
       */
      table.string('status', 20).notNullable().defaultTo('active')

      /**
       * Per tenant knobs: message body retention, default priority,
       * default expiry, notification preferences.
       */
      table.jsonb('settings').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
