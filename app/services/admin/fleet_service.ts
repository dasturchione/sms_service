import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import SimProfile from '#models/sim_profile'
import type Gateway from '#models/gateway'
import GatewayEvent from '#models/gateway_event'
import UssdRequest from '#models/ussd_request'
import { NotFoundException } from '#exceptions/domain_exception'

export type SimUpdate = {
  label?: string | null
  isActive?: boolean
  smsPerMinute?: number
  dailyQuota?: number | null
  balanceCheckIntervalMin?: number
  /** Only ever set back to true: the device is what sets it to false. */
  ussdSupported?: boolean
}

/**
 * The parts of a device an operator tunes and inspects.
 *
 * Kept apart from `GatewayService`, which is about the device's lifecycle —
 * registering, approving, claiming. This is about running the fleet once it
 * exists: pacing a SIM, taking one slot out of service, and reading back what
 * a phone has been doing.
 */
export default class FleetService {
  static async findSim(uid: string): Promise<SimProfile> {
    const sim = await SimProfile.query().where('uid', uid).first()
    if (!sim) throw new NotFoundException('SIM profile', uid)

    return sim
  }

  /**
   * Changes what an operator decides about one SIM slot.
   *
   * `state` is absent on purpose: that is the phone's report of whether the
   * card is readable, and a panel that could overwrite it would let someone
   * mark a missing SIM as ready and watch every message routed to it fail.
   */
  static async updateSim(uid: string, input: SimUpdate): Promise<SimProfile> {
    const sim = await this.findSim(uid)

    if (input.label !== undefined) sim.label = input.label
    if (input.isActive !== undefined) sim.isActive = input.isActive
    if (input.smsPerMinute !== undefined) sim.smsPerMinute = input.smsPerMinute
    if (input.dailyQuota !== undefined) sim.dailyQuota = input.dailyQuota
    if (input.balanceCheckIntervalMin !== undefined) {
      sim.balanceCheckIntervalMin = input.balanceCheckIntervalMin
    }

    /**
     * Re-arming USSD also clears the failure streak. Leaving it would have the
     * scheduler give up again on the next single failure, which is not what
     * "try again" means.
     */
    if (input.ussdSupported === true) {
      sim.ussdSupported = true
      sim.balanceFailures = 0
    }

    await sim.save()

    return sim
  }

  /**
   * What the device has been doing, newest first.
   *
   * This is the answer to "why did that phone drop off": connects, disconnects,
   * approvals and errors, in the order they happened.
   */
  static async events(gateway: Gateway, limit = 100): Promise<GatewayEvent[]> {
    return GatewayEvent.query().where('gateway_id', gateway.id).orderBy('id', 'desc').limit(limit)
  }

  /**
   * USSD sessions run on this device's SIMs, whether by an operator or by the
   * balance scheduler. Reading the verbatim replies here is how a changed
   * operator code is spotted.
   */
  static async ussdHistory(gateway: Gateway, limit = 25): Promise<UssdRequest[]> {
    const simIds = await db.from('sim_profiles').select('id').where('gateway_id', gateway.id)

    const ids = (simIds as Record<string, any>[]).map((row) => Number(row.id))
    if (ids.length === 0) return []

    return UssdRequest.query().whereIn('sim_profile_id', ids).orderBy('id', 'desc').limit(limit)
  }

  /**
   * Recent connections, which say something the event log does not: how long
   * the device stayed up each time, and what ended it.
   */
  static async sessions(gateway: Gateway, limit = 10) {
    const rows = await db
      .from('gateway_sessions')
      .where('gateway_id', gateway.id)
      .orderBy('id', 'desc')
      .limit(limit)

    return (rows as Record<string, any>[]).map((row) => ({
      nodeId: row.node_id,
      ipAddress: row.ip_address,
      appVersion: row.app_version,
      connectedAt: row.connected_at ? DateTime.fromJSDate(new Date(row.connected_at)) : null,
      disconnectedAt: row.disconnected_at
        ? DateTime.fromJSDate(new Date(row.disconnected_at))
        : null,
      disconnectReason: row.disconnect_reason,
    }))
  }
}
