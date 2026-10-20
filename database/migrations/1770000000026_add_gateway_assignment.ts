import { BaseSchema } from '@adonisjs/lucid/schema'
import { generateDeviceCode } from '#utils/device_code'

/**
 * Replaces operator approval with assignment.
 *
 * Devices now register and connect on their own and start out unassigned.
 * What a device is for (the shared pool, or one tenant's own phone) is decided
 * afterwards, by an operator or by the tenant claiming it with its code.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('gateways', (table) => {
      /**
       * The device's public handle: shown as a QR code on the phone, used by
       * a tenant to claim it and then to send through it.
       */
      table.string('code', 16).nullable().unique()

      /**
       * unassigned | pool | tenant. `tenant_id` is set exactly when this is
       * `tenant`.
       */
      table.string('assignment', 16).notNullable().defaultTo('unassigned')

      /**
       * The one-time claim codes of the approval flow, which no longer exists.
       */
      table.dropColumn('claim_code')
      table.dropColumn('claim_code_expires_at')

      table.index(['assignment', 'status'], 'gateways_assignment_index')
    })

    this.schema.alterTable('sms_messages', (table) => {
      /**
       * A SIM slot the tenant asked for on the device it named.
       */
      table.integer('requested_slot').nullable()
    })

    this.defer(async (db) => {
      /**
       * Existing devices keep doing what they did: a dedicated device is now a
       * tenant's own, an approved shared one is in the pool, and one still
       * waiting for approval is simply unassigned.
       */
      await db.rawQuery(`
        UPDATE gateways SET assignment = CASE
          WHEN tenant_id IS NOT NULL THEN 'tenant'
          WHEN approved_at IS NOT NULL THEN 'pool'
          ELSE 'unassigned'
        END
      `)
      await db.rawQuery(`UPDATE gateways SET status = 'offline' WHERE status = 'pending_approval'`)

      const rows = await db.from('gateways').whereNull('code').select('id')
      const used = new Set<string>()
      for (const row of rows) {
        let code = generateDeviceCode()
        while (used.has(code)) code = generateDeviceCode()
        used.add(code)
        await db.from('gateways').where('id', row.id).update({ code })
      }

      await db.rawQuery('ALTER TABLE gateways ALTER COLUMN code SET NOT NULL')
    })
  }

  async down() {
    this.schema.alterTable('sms_messages', (table) => {
      table.dropColumn('requested_slot')
    })
    this.schema.alterTable('gateways', (table) => {
      table.dropIndex(['assignment', 'status'], 'gateways_assignment_index')
      table.dropColumn('assignment')
      table.dropColumn('code')
      table.string('claim_code', 64).nullable().unique()
      table.timestamp('claim_code_expires_at').nullable()
    })
  }
}
