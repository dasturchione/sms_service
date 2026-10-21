import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import connectionManager from '#realtime/connection_manager'
import RecipientAllowance from '#services/sms/recipient_allowance'
import { billingDate } from '#utils/billing_day'
import gatewayConfig from '#config/gateway'
import { GatewayStatus } from '#enums/gateway_status'
import { SmsAttemptStatus, SmsStatus } from '#enums/sms_status'

export type DeviceSimView = {
  slot: number
  label: string | null
  operator: string | null
  phoneNumber: string | null
  state: string
  isActive: boolean
  /** Sends that actually left this SIM today, and failures, in the operator's day. */
  today: { sent: number; failed: number }
  /**
   * Distinct numbers reached today. `limit` is null unless a cap was set on
   * this SIM: the platform's operator caps do not apply to a tenant's own
   * phone.
   */
  recipients: { used: number; limit: number | null }
}

export type DeviceView = {
  code: string
  name: string | null
  status: string
  /** Connected right now, as opposed to merely last seen. */
  online: boolean
  battery: number | null
  isCharging: boolean | null
  network: string | null
  signalLevel: number | null
  lastSeenAt: string | null
  device: {
    manufacturer: string | null
    model: string | null
    androidVersion: string | null
    appVersion: string | null
  }
  /** Messages addressed to this device that are still waiting for it. */
  waiting: number
  sims: DeviceSimView[]
}

/**
 * How a tenant sees its own phones.
 *
 * Built for one question above all: is my device working? Hence today's sent
 * and failed counts per slot, what is still waiting for it, and whether it is
 * connected right now, which `status` alone cannot say.
 */
export default class TenantDevices {
  static async describe(gateways: Gateway[]): Promise<DeviceView[]> {
    if (gateways.length === 0) return []

    const gatewayIds = gateways.map((gateway) => gateway.id)
    const usageDate = billingDate()

    /**
     * The operator's day, as a UTC instant, so "today" means the same thing
     * here as it does for the allowance and the quota.
     */
    const dayStart = DateTime.now()
      .setZone(gatewayConfig.routing.billingTimezone)
      .startOf('day')
      .toUTC()
      .toSQL()!

    const [sims, attempts, waiting, usage] = await Promise.all([
      SimProfile.query()
        .whereIn('gateway_id', gatewayIds)
        .preload('operator')
        .orderBy(['gateway_id', 'slot']),

      db
        .from('sms_attempts')
        .whereIn('gateway_id', gatewayIds)
        .where('started_at', '>=', dayStart)
        .whereIn('status', [SmsAttemptStatus.SENT, SmsAttemptStatus.FAILED])
        .groupBy('sim_profile_id', 'status')
        .select('sim_profile_id', 'status')
        .count('* as total'),

      db
        .from('sms_messages')
        .whereIn('requested_gateway_id', gatewayIds)
        .whereIn('status', [SmsStatus.QUEUED, SmsStatus.CREATED])
        .groupBy('requested_gateway_id')
        .select('requested_gateway_id')
        .count('* as total'),

      RecipientAllowance.usageBySim(usageDate, gatewayConfig.routing.defaultDailyRecipientLimit),
    ])

    const counts = new Map<string, number>()
    for (const row of attempts) {
      counts.set(`${row.sim_profile_id}:${row.status}`, Number(row.total))
    }

    const waitingByGateway = new Map<number, number>()
    for (const row of waiting) {
      waitingByGateway.set(Number(row.requested_gateway_id), Number(row.total))
    }

    const usageBySim = new Map(usage.map((entry) => [entry.simProfileId, entry]))

    return gateways.map((gateway) => ({
      code: gateway.displayCode,
      name: gateway.name,
      status: gateway.status,
      online: gateway.status === GatewayStatus.ONLINE && connectionManager.has(gateway.id),
      battery: gateway.battery,
      isCharging: gateway.isCharging,
      network: gateway.network,
      signalLevel: gateway.signalLevel,
      lastSeenAt: gateway.lastSeenAt?.toISO() ?? null,
      device: {
        manufacturer: gateway.manufacturer,
        model: gateway.model,
        androidVersion: gateway.androidVersion,
        appVersion: gateway.appVersion,
      },
      waiting: waitingByGateway.get(gateway.id) ?? 0,
      sims: sims
        .filter((sim) => sim.gatewayId === gateway.id)
        .map((sim) => {
          const today = usageBySim.get(sim.id)

          return {
            slot: sim.slot,
            label: sim.label,
            operator: sim.operator?.code ?? null,
            phoneNumber: sim.phoneNumber,
            state: sim.state,
            isActive: sim.isActive,
            today: {
              sent: counts.get(`${sim.id}:${SmsAttemptStatus.SENT}`) ?? 0,
              failed: counts.get(`${sim.id}:${SmsAttemptStatus.FAILED}`) ?? 0,
            },
            recipients: { used: today?.used ?? 0, limit: today?.limit ?? null },
          }
        }),
    }))
  }
}
