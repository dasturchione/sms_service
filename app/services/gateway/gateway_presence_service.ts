import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import GatewayService from '#services/gateway/gateway_service'
import gatewayConfig from '#config/gateway'
import type GatewayConnection from '#realtime/gateway_connection'
import type { HeartbeatPayload } from '#realtime/protocol'
import { GatewayStatus, SimState } from '#enums/gateway_status'

/**
 * Keeps the database's view of the fleet roughly in step with reality.
 *
 * "Roughly" is deliberate. The live truth about a connected device is the
 * socket object in memory; the database copy exists so operators and other
 * nodes can see the fleet. Writing every heartbeat straight through would mean
 * three writes per device per minute for a value nothing reads that often.
 */
export default class GatewayPresenceService {
  static async recordHeartbeat(
    connection: GatewayConnection,
    payload: HeartbeatPayload
  ): Promise<void> {
    const now = DateTime.now()

    connection.state = {
      battery: this.clampPercentage(payload.battery),
      isCharging: typeof payload.charging === 'boolean' ? payload.charging : null,
      network: typeof payload.network === 'string' ? payload.network.slice(0, 16) : null,
      signalLevel: this.clampSignal(payload.signal),
      lastSeenAt: now,
    }

    if (Array.isArray(payload.sims)) {
      await this.applySimStates(connection.gatewayId, payload.sims)
    }

    const sincePersist = now.diff(connection.persistedAt, 'seconds').seconds
    if (sincePersist < gatewayConfig.presence.persistEverySeconds) return

    await this.flush(connection)
  }

  /**
   * Writes the in-memory telemetry through to the database. Called on a
   * throttle during a session and unconditionally when one ends.
   */
  static async flush(connection: GatewayConnection): Promise<void> {
    connection.persistedAt = DateTime.now()

    await db.from('gateways').where('id', connection.gatewayId).update({
      battery: connection.state.battery,
      is_charging: connection.state.isCharging,
      network: connection.state.network,
      signal_level: connection.state.signalLevel,
      last_seen_at: connection.state.lastSeenAt.toSQL(),
      updated_at: new Date(),
    })
  }

  static async recordSimState(
    connection: GatewayConnection,
    payload: HeartbeatPayload
  ): Promise<void> {
    if (!Array.isArray(payload.sims)) return
    await this.applySimStates(connection.gatewayId, payload.sims)
  }

  /**
   * Marks gateways offline once they stop reporting.
   *
   * A socket can stay open on a phone that has already lost its network, so
   * silence is the only reliable signal. Anything that has gone quiet is taken
   * out of rotation and its in-flight work is freed by the lease sweep.
   */
  static async markStaleGatewaysOffline(): Promise<number> {
    const cutoff = DateTime.now()
      .minus({ seconds: gatewayConfig.presence.offlineAfterSeconds })
      .toSQL()!

    const affected = await db
      .from('gateways')
      .where('status', GatewayStatus.ONLINE)
      .where((builder) => builder.whereNull('last_seen_at').orWhere('last_seen_at', '<', cutoff))
      .update({ status: GatewayStatus.OFFLINE, node_id: null, updated_at: new Date() })

    return Number(affected)
  }

  private static async applySimStates(
    gatewayId: number,
    sims: { slot: number; state: string }[]
  ): Promise<void> {
    for (const sim of sims) {
      if (typeof sim?.slot !== 'number') continue

      const state = this.normalizeSimState(sim.state)
      await SimProfile.query()
        .where('gateway_id', gatewayId)
        .where('slot', sim.slot)
        .update({ state, updated_at: new Date() })
    }
  }

  /**
   * Sends the device its current configuration, so an operator changing a rate
   * limit or disabling a slot takes effect without a reconnect.
   */
  static async describeSession(gateway: Gateway) {
    const profiles = await SimProfile.query()
      .where('gateway_id', gateway.id)
      .where('is_active', true)
      .preload('operator')
      .orderBy('slot', 'asc')

    return {
      gatewayUid: gateway.uid,
      nodeId: gatewayConfig.nodeId,
      heartbeatSeconds: gatewayConfig.websocket.heartbeatSeconds,
      maxInFlight: gateway.maxInFlight,
      simProfiles: profiles.map((profile) => ({
        uid: profile.uid,
        slot: profile.slot,
        label: profile.label,
        operator: profile.operator?.code ?? null,
        smsPerMinute: profile.smsPerMinute,
      })),
    }
  }

  /**
   * Called when this node starts. Any gateway still marked as attached to this
   * node is a leftover from a previous run that did not shut down cleanly.
   */
  static async releaseOwnedGateways(nodeId: string): Promise<number> {
    const affected = await db
      .from('gateways')
      .where('node_id', nodeId)
      .update({ status: GatewayStatus.OFFLINE, node_id: null, updated_at: new Date() })

    return Number(affected)
  }

  static async logOffline(gatewayId: number, reason: string): Promise<void> {
    const gateway = await Gateway.find(gatewayId)
    if (gateway) await GatewayService.logEvent(gateway, 'offline', { reason }, 'warning')
  }

  private static normalizeSimState(value: string): SimState {
    const known = Object.values(SimState).find((candidate) => candidate === value)
    return (known as SimState) ?? SimState.UNKNOWN
  }

  private static clampPercentage(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) return null
    return Math.min(100, Math.max(0, Math.round(value)))
  }

  private static clampSignal(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) return null
    return Math.min(4, Math.max(0, Math.round(value)))
  }
}
