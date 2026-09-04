import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pre-aggregated counters. Dashboards read from here instead of scanning
 * sms_messages, which stops being viable past a few million rows.
 *
 * A null dimension means "all", so one table serves tenant, SIM and operator
 * breakdowns as well as the platform wide totals.
 */
export default class extends BaseSchema {
  protected tableName = 'sms_daily_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.date('date').notNullable()

      table
        .integer('tenant_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')
      table
        .integer('sim_profile_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sim_profiles')
        .onDelete('CASCADE')
      table
        .integer('operator_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('operators')
        .onDelete('CASCADE')

      table.integer('total').notNullable().defaultTo(0)
      table.integer('sent').notNullable().defaultTo(0)
      table.integer('delivered').notNullable().defaultTo(0)
      table.integer('failed').notNullable().defaultTo(0)
      table.integer('pending').notNullable().defaultTo(0)
      table.integer('segments').notNullable().defaultTo(0)
      table.integer('avg_send_ms').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['date'], 'sms_daily_stats_date_index')
    })

    /**
     * Nullable columns do not participate in a plain unique constraint in
     * Postgres, so the key is built on coalesced values.
     */
    this.schema.raw(`
      CREATE UNIQUE INDEX sms_daily_stats_dimensions_unique
      ON sms_daily_stats (
        date,
        COALESCE(tenant_id, 0),
        COALESCE(sim_profile_id, 0),
        COALESCE(operator_id, 0)
      )
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
