import type { HttpContext } from '@adonisjs/core/http'
import SimProfile from '#models/sim_profile'
import RecipientAllowance from '#services/sms/recipient_allowance'
import { NotFoundException } from '#exceptions/domain_exception'
import { allowanceQueryValidator } from '#validators/allowance'
import { billingDate } from '#utils/billing_day'
import gatewayConfig from '#config/gateway'

/**
 * The daily distinct-recipient allowance, per SIM.
 *
 * Operators cap how many different numbers a SIM may message per day. This is
 * where an operator sees how much of today's allowance each slot has used,
 * which numbers it is serving, and therefore why a message went through slot 2
 * or why it is still waiting.
 */
export default class AdminAllowancesController {
  async index({ request, serialize }: HttpContext) {
    const { date } = await request.validateUsing(allowanceQueryValidator)
    const usageDate = date ?? billingDate()

    const sims = await RecipientAllowance.usageBySim(
      usageDate,
      gatewayConfig.routing.defaultDailyRecipientLimit
    )

    return serialize.withoutWrapping({
      data: sims.map(({ simProfileId, ...sim }) => sim),
      meta: {
        date: usageDate,
        timezone: gatewayConfig.routing.billingTimezone,

        /**
         * Shown so the order of the list can be read correctly: under
         * `sequential` it is also the order SIMs fill in.
         */
        fillStrategy: gatewayConfig.routing.fillStrategy,
      },
    })
  }

  async show({ params, request, serialize }: HttpContext) {
    const { date } = await request.validateUsing(allowanceQueryValidator)
    const usageDate = date ?? billingDate()

    const sim = await SimProfile.findBy('uid', params.simUid)
    if (!sim) throw new NotFoundException('SIM', params.simUid)

    const [usage, recipients] = await Promise.all([
      RecipientAllowance.usageBySim(usageDate, gatewayConfig.routing.defaultDailyRecipientLimit),
      RecipientAllowance.recipientsForSim(sim.id, usageDate),
    ])

    const row = usage.find((entry) => entry.simProfileId === sim.id)
    const { simProfileId, ...summary } = row!

    return serialize({
      date: usageDate,
      sim: summary,
      recipients,
    })
  }
}
