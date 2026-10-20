import gatewayConfig from '#config/gateway'
import { billingDate } from '#utils/billing_day'
import RecipientAllowance from '#services/sms/recipient_allowance'
import type { HttpContext } from '@adonisjs/core/http'
import SimProfile from '#models/sim_profile'
import Gateway from '#models/gateway'
import SimProfileTransformer from '#transformers/sim_profile_transformer'

/**
 * What a tenant can see about the credit behind its own traffic.
 *
 * Only SIMs on devices dedicated to the tenant are listed. A shared pool SIM
 * carries several tenants' messages, so its balance is platform information:
 * showing it would leak how much other tenants send and offer a number the
 * tenant cannot act on.
 */
export default class BalancesController {
  async index({ tenant, serialize }: HttpContext) {
    const gateways = await Gateway.query().where('tenant_id', tenant.id).select('id')

    if (gateways.length === 0) {
      return serialize.withoutWrapping({ data: [], meta: { checkedSims: 0 } })
    }

    const profiles = await SimProfile.query()
      .whereIn(
        'gateway_id',
        gateways.map((gateway) => gateway.id)
      )
      .where('is_active', true)
      .orderBy(['gateway_id', 'slot'])

    const usageDate = billingDate()
    const usage = await RecipientAllowance.usageBySim(
      usageDate,
      gatewayConfig.routing.defaultDailyRecipientLimit
    )
    const usageBySim = new Map(usage.map((entry) => [entry.simProfileId, entry]))

    return serialize.withoutWrapping({
      data: profiles.map((profile) => {
        const today = usageBySim.get(profile.id)

        return {
          ...new SimProfileTransformer(profile).toObject(),

          /**
           * How many different numbers this SIM can still reach today. The
           * operator caps reach, not volume, so this is what actually limits a
           * campaign to new customers.
           */
          recipientAllowance: {
            limit: today?.limit ?? null,
            used: today?.used ?? 0,
            remaining: today?.remaining ?? null,
          },
        }
      }),
      meta: {
        allowanceDate: usageDate,
        /**
         * How many of those balances are actually known. A tenant seeing
         * nulls should be able to tell "nobody has asked yet" from "we asked
         * and the operator said zero".
         */
        checkedSims: profiles.filter((profile) => profile.balanceCheckedAt !== null).length,
      },
    })
  }
}
