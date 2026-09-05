import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import UssdService from '#services/ussd/ussd_service'
import connectionManager from '#realtime/connection_manager'
import { SimState } from '#enums/gateway_status'
import { UssdKind } from '#enums/ussd'
import ussdConfig from '#config/ussd'

/**
 * Keeps SIM balances roughly current.
 *
 * "Roughly" is the honest word: a balance read three hours ago is what the
 * dispatcher routes on, because reading it more often would spend the radio on
 * accounting instead of on messages. It is used as a floor — a SIM known to be
 * empty is skipped — not as a ledger.
 *
 * Only SIMs on devices attached to this process are considered. A session has
 * to run on the socket that exists, and another node's device is not ours to
 * talk to.
 */
export default class BalanceScheduler {
  /**
   * Checks the SIMs that are due. Runs one session at a time on purpose: they
   * are slow, they occupy the radio, and nothing here is urgent.
   */
  static async run(): Promise<number> {
    const reachable = connectionManager.onlineGatewayIds()
    if (reachable.length === 0) return 0

    const due = await this.dueSimProfiles(reachable)
    let checked = 0

    for (const sim of due) {
      try {
        /**
         * The SMS balance is what the dispatcher actually needs. Operators
         * that do not publish one leave `sms_balance` null, and the money
         * balance answers the question a person asks instead.
         */
        await UssdService.request(sim.id, sim.kind)
        checked++
      } catch (error) {
        /**
         * A refusal here is ordinary: the device may have dropped off between
         * the query and the send. The next pass will pick it up.
         */
        logger.debug({ err: error, simProfileId: sim.id }, 'skipped a balance check')
      }
    }

    return checked
  }

  /**
   * SIMs whose last reading is older than their own interval.
   *
   * A SIM that has never been read is due immediately, which is what makes a
   * newly provisioned device report a balance within minutes rather than after
   * its first interval.
   */
  private static async dueSimProfiles(
    reachable: number[]
  ): Promise<{ id: number; kind: UssdKind }[]> {
    const rows = await db
      .from('sim_profiles as sp')
      .join('operators as o', 'o.id', 'sp.operator_id')
      /**
       * Only SIMs whose operator actually has a code configured; asking the
       * others would fail on every pass.
       */
      .joinRaw(
        `JOIN operator_ussd_commands c
            ON c.operator_id = o.id
           AND c.is_active = true
           AND c.kind IN (?, ?)`,
        [UssdKind.SMS_BALANCE, UssdKind.BALANCE]
      )
      .whereIn('sp.gateway_id', reachable)
      .where('sp.is_active', true)
      .where('sp.ussd_supported', true)
      .where('sp.state', SimState.READY)
      .where('sp.balance_failures', '<', ussdConfig.balance.giveUpAfterFailures)
      .where((builder) =>
        builder
          .whereNull('sp.balance_checked_at')
          .orWhereRaw(
            `sp.balance_checked_at < now() - (COALESCE(NULLIF(sp.balance_check_interval_min, 0), ?) * interval '1 minute')`,
            [ussdConfig.balance.defaultIntervalMinutes]
          )
      )
      .select('sp.id as id')
      /**
       * One row per SIM even when the operator publishes both codes, and the
       * SMS balance wins because that is the number routing depends on.
       */
      .select(
        db.raw(`MIN(CASE WHEN c.kind = ? THEN 0 ELSE 1 END) as prefers_sms`, [UssdKind.SMS_BALANCE])
      )
      .groupBy('sp.id')
      .orderByRaw('MIN(sp.balance_checked_at) ASC NULLS FIRST')
      .limit(ussdConfig.balance.batchSize)

    return (rows as Record<string, any>[]).map((row) => ({
      id: Number(row.id),
      kind: Number(row.prefers_sms) === 0 ? UssdKind.SMS_BALANCE : UssdKind.BALANCE,
    }))
  }
}
