import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'operators'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('name').notNullable()
      table.string('code', 32).notNullable().unique()
      table.string('country', 2).notNullable().defaultTo('UZ')

      /**
       * Mobile country / network code, used to match a SIM reported by the
       * device to a known operator without trusting the human readable name.
       */
      table.string('mcc', 4).nullable()
      table.string('mnc', 4).nullable()

      /**
       * National prefixes owned by the operator, e.g. ["90", "91"].
       * Used by the selector to prefer on-net routing.
       */
      table.jsonb('phone_prefixes').notNullable().defaultTo('[]')

      table.boolean('is_active').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
