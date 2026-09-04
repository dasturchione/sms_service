import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The text actually put on the wire.
 *
 * `message_body` holds what the tenant allowed us to *retain*, which by
 * default has its digits masked. Retention is about what we keep, not about
 * what we transmit, so the verbatim body lives here and is erased the moment
 * the message reaches a terminal state.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('sms_messages', (table) => {
      table.text('dispatch_body').nullable()
    })
  }

  async down() {
    this.schema.alterTable('sms_messages', (table) => {
      table.dropColumn('dispatch_body')
    })
  }
}
