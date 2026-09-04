import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USSD codes change without notice, so they live in the database rather than
 * in the device build.
 */
export default class extends BaseSchema {
  protected tableName = 'operator_ussd_commands'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('operator_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('operators')
        .onDelete('CASCADE')

      /**
       * balance | sms_balance | internet_balance | phone_number
       */
      table.string('kind', 32).notNullable()
      table.string('command', 32).notNullable()

      /**
       * Replies to send for a multi step menu, e.g. ["1", "3"]. Empty for
       * single shot codes.
       */
      table.jsonb('steps').notNullable().defaultTo('[]')

      /**
       * Key into the parser registry. Unknown responses are stored raw and
       * flagged instead of being silently misread.
       */
      table.string('parser_key', 64).notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['operator_id', 'kind'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
