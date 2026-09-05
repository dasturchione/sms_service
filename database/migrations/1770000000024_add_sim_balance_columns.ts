import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Money balance alongside the SMS balance.
 *
 * `sms_balance` answers "how many messages can this SIM still send", which is
 * what the dispatcher needs. It is not what a person tops up: they add money,
 * and on most tariffs the two are not the same number. Both are therefore kept,
 * because either one alone leaves a question that cannot be answered.
 */
export default class extends BaseSchema {
  protected tableName = 'sim_profiles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Stored in tiyin, the hundredth of a so'm: an integer, like every other
       * money value in the platform. A float here would drift, and a balance
       * that drifts is a balance nobody trusts.
       */
      table.bigInteger('money_balance').nullable()

      table.string('balance_currency', 8).nullable()

      /**
       * Set when a device reports that it cannot run USSD at all — an OEM or
       * carrier restriction, not a transient failure. The scheduler stops
       * asking, since the answer will not change until the phone does.
       */
      table.boolean('ussd_supported').notNullable().defaultTo(true)

      /**
       * Consecutive failed balance checks. A code that changed silently would
       * otherwise be retried on the interval forever.
       */
      table.integer('balance_failures').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('money_balance')
      table.dropColumn('balance_currency')
      table.dropColumn('ussd_supported')
      table.dropColumn('balance_failures')
    })
  }
}
