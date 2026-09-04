import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A general purpose work queue.
 *
 * Messages do not need this: `sms_messages` is its own queue, which keeps a
 * single source of truth for the thing that matters most. Everything else does
 * need somewhere to live, though. A webhook delivery has no natural home row,
 * has to survive a restart, and has to be retried on a schedule.
 */
export default class extends BaseSchema {
  protected tableName = 'jobs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table.string('queue', 48).notNullable()
      table.jsonb('payload').notNullable()

      /**
       * pending | running | failed | done
       *
       * Completed jobs are deleted rather than marked done, so the table stays
       * the size of the backlog rather than the size of history. The status
       * exists for the failed ones worth inspecting.
       */
      table.string('status', 16).notNullable().defaultTo('pending')

      table.integer('attempts').notNullable().defaultTo(0)
      table.integer('max_attempts').notNullable().defaultTo(5)

      /**
       * When the job becomes eligible. Backoff is expressed by pushing this
       * forward rather than by sleeping anywhere.
       */
      table.timestamp('run_at').notNullable()

      /**
       * Held by a worker until this instant. A worker that dies mid-job leaves
       * the lease to expire instead of stranding the work.
       */
      table.timestamp('lease_expires_at').nullable()
      table.string('locked_by', 64).nullable()

      table.text('last_error').nullable()

      /**
       * Lets a caller enqueue the same logical job twice without producing two
       * deliveries.
       */
      table.string('dedupe_key', 128).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.raw(`
      CREATE INDEX jobs_claim_index
      ON jobs (queue, run_at, id)
      WHERE status = 'pending'
    `)

    this.schema.raw(`
      CREATE INDEX jobs_lease_index
      ON jobs (lease_expires_at)
      WHERE status = 'running'
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX jobs_dedupe_unique
      ON jobs (queue, dedupe_key)
      WHERE dedupe_key IS NOT NULL AND status <> 'failed'
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
