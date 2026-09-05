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

    return serialize.withoutWrapping({
      data: SimProfileTransformer.transform(profiles),
      meta: {
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
