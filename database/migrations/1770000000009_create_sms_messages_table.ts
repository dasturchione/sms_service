import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sms_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table.string('uid', 40).notNullable().unique()

      table
        .integer('tenant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')
      table
        .integer('api_client_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('api_clients')
        .onDelete('SET NULL')

      /**
       * Client supplied de-duplication key, unique per tenant. Replaying the
       * same key returns the original message instead of sending twice.
       */
      table.string('idempotency_key', 128).nullable()

      /**
       * Free form identifier from the tenant side (order id, user id, ...),
       * echoed back on webhooks.
       */
      table.string('reference', 128).nullable()

      table.string('recipient', 32).notNullable()
      table.string('recipient_normalized', 20).notNullable()

      /**
       * Nullable because a tenant may configure the platform to keep only the
       * hash of the body. See tenants.settings.storeBody.
       */
      table.text('message_body').nullable()
      table.string('body_hash', 64).notNullable()
      table.integer('segments').notNullable().defaultTo(1)
      table.string('encoding', 8).notNullable().defaultTo('gsm7')

      /**
       * created | queued | assigned | sending | sent | delivered
       * | failed | cancelled | expired
       */
      table.string('status', 16).notNullable().defaultTo('created')
      table.integer('priority').notNullable().defaultTo(5)
      table.integer('attempts').notNullable().defaultTo(0)
      table.integer('max_attempts').notNullable().defaultTo(3)

      table
        .integer('requested_operator_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('operators')
        .onDelete('SET NULL')
      table
        .integer('requested_gateway_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('gateways')
        .onDelete('SET NULL')
      table
        .integer('sim_profile_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sim_profiles')
        .onDelete('SET NULL')

      /**
       * A dispatched message is leased to a device. When the lease expires
       * without a result the message returns to the queue.
       */
      table.timestamp('lease_expires_at').nullable()

      table.string('provider_message_id', 128).nullable()
      table.string('error_code', 48).nullable()
      table.text('error_message').nullable()

      table.timestamp('queued_at').nullable()
      table.timestamp('assigned_at').nullable()
      table.timestamp('sent_at').nullable()
      table.timestamp('delivered_at').nullable()
      table.timestamp('failed_at').nullable()
      table.timestamp('expires_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['tenant_id', 'created_at'], 'sms_messages_tenant_created_index')
      table.index(['tenant_id', 'status'], 'sms_messages_tenant_status_index')
      table.index(['status', 'lease_expires_at'], 'sms_messages_lease_index')
      table.index(['sim_profile_id', 'created_at'], 'sms_messages_sim_created_index')
      table.index(['reference'], 'sms_messages_reference_index')
    })

    /**
     * Partial unique index: only messages that actually carry an idempotency
     * key participate, so unkeyed sends are unconstrained.
     */
    this.schema.raw(`
      CREATE UNIQUE INDEX sms_messages_idempotency_unique
      ON sms_messages (tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
