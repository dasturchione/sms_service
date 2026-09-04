import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    /**
     * Per client rate limiting counts a client's recent messages, which
     * without this index means scanning everything the tenant ever sent.
     */
    this.schema.raw(`
      CREATE INDEX sms_messages_client_created_index
      ON sms_messages (api_client_id, created_at DESC)
      WHERE api_client_id IS NOT NULL
    `)

    /**
     * The daily rollup groups a day's messages by tenant, SIM and operator.
     */
    this.schema.raw(`
      CREATE INDEX sms_messages_rollup_index
      ON sms_messages (created_at)
    `)
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS sms_messages_rollup_index')
    this.schema.raw('DROP INDEX IF EXISTS sms_messages_client_created_index')
  }
}
