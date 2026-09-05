import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import Tenant from '#models/tenant'
import WebhookService from '#services/webhooks/webhook_service'
import { WebhookEvent } from '#enums/webhook_event'
import { DEFAULT_TENANT_SETTINGS } from '#enums/tenant'

/**
 * Conditions worth waking someone for.
 *
 * Alerts are published as webhooks rather than kept in a table of their own:
 * the tenant is the only party who can act on a low balance or a dead phone,
 * and an alert nobody is told about is not an alert.
 *
 * Every alert is de-duplicated by day. A SIM that is out of credit is out of
 * credit for hours, and repeating that every fifteen seconds would train the
 * recipient to ignore it.
 */
export default class AlertService {
  /**
   * A device stopped answering. Only reported to the tenant that owns it: a
   * shared pool device going quiet is the platform's problem, and the tenants
   * using it should see routing continue rather than an alarm they cannot act
   * on.
   */
  static async gatewayOffline(gateway: {
    uid: string
    name: string | null
    tenantId: number | null
  }): Promise<void> {
    logger.warn({ gatewayUid: gateway.uid }, 'gateway went offline')

    if (!gateway.tenantId) return

    await WebhookService.publish(
      gateway.tenantId,
      WebhookEvent.GATEWAY_OFFLINE,
      { uid: gateway.uid, name: gateway.name },
      { dedupeSuffix: `${gateway.uid}:${this.today()}` }
    )
  }

  /**
   * Finds SIMs that are running out of credit.
   *
   * The threshold is per tenant because what counts as low depends on what a
   * tenant sends: a bank pushing one time codes all day empties a SIM that
   * would last a month elsewhere.
   *
   * Balances are filled in by the USSD runner, which lands in M5. Until then
   * `sms_balance` stays null and this sweep is a no-op — deliberately, since
   * treating "unknown" as "zero" would alert about every SIM on the platform.
   */
  static async sweepLowBalances(): Promise<number> {
    const rows = await db
      .from('sim_profiles as sp')
      .innerJoin('gateways as g', 'g.id', 'sp.gateway_id')
      .whereNotNull('sp.sms_balance')
      .whereNotNull('g.tenant_id')
      .where('sp.is_active', true)
      .select(
        'sp.uid as uid',
        'sp.label as label',
        'sp.phone_number as phone_number',
        'sp.sms_balance as sms_balance',
        'g.tenant_id as tenant_id',
        'g.uid as gateway_uid'
      )

    if (rows.length === 0) return 0

    /**
     * Thresholds are read once per sweep rather than per SIM: a fleet has many
     * more SIMs than tenants.
     */
    const thresholds = await this.thresholdsFor([
      ...new Set((rows as Record<string, any>[]).map((row) => Number(row.tenant_id))),
    ])

    let alerted = 0

    for (const row of rows as Record<string, any>[]) {
      const tenantId = Number(row.tenant_id)
      const threshold = thresholds.get(tenantId) ?? DEFAULT_TENANT_SETTINGS.lowBalanceThreshold

      if (Number(row.sms_balance) >= threshold) continue

      await WebhookService.publish(
        tenantId,
        WebhookEvent.BALANCE_LOW,
        {
          simUid: row.uid,
          gatewayUid: row.gateway_uid,
          label: row.label,
          phoneNumber: row.phone_number,
          balance: Number(row.sms_balance),
          threshold,
        },
        { dedupeSuffix: `${row.uid}:${this.today()}` }
      )

      logger.warn(
        { simUid: row.uid, balance: Number(row.sms_balance), threshold },
        'SIM balance is below the tenant threshold'
      )
      alerted++
    }

    return alerted
  }

  private static async thresholdsFor(tenantIds: number[]): Promise<Map<number, number>> {
    const tenants = await Tenant.query().whereIn('id', tenantIds)

    return new Map(
      tenants.map((tenant) => [tenant.id, tenant.resolvedSettings.lowBalanceThreshold])
    )
  }

  /**
   * The de-duplication bucket. One calendar day, which is the unit a person
   * acting on the alert thinks in.
   */
  private static today(): string {
    return DateTime.now().toISODate()!
  }
}
