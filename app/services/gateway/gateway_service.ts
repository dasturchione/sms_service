import { DateTime } from 'luxon'
import { createHash } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import Gateway from '#models/gateway'
import GatewaySession from '#models/gateway_session'
import GatewayEvent from '#models/gateway_event'
import SimProfile from '#models/sim_profile'
import Operator from '#models/operator'
import AuditService from '#services/audit/audit_service'
import { generateDeviceCode } from '#utils/device_code'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { GatewayAssignment, GatewayStatus, SimState } from '#enums/gateway_status'
import { ActorType, AuditAction } from '#enums/audit_action'
import { GATEWAY_ABILITIES } from '#enums/ability'

export type RegisterGatewayInput = {
  deviceId: string
  deviceName?: string
  manufacturer?: string
  model?: string
  androidVersion?: string
  appVersion?: string
}

export type ReportedSim = {
  slot: number
  phoneNumber?: string | null
  operatorName?: string | null
  mcc?: string | null
  mnc?: string | null
  imsi?: string | null
  iccid?: string | null
  state?: SimState
}

/**
 * Owns the device lifecycle: registration, approval, provisioning and the
 * bookkeeping around a live session.
 */
export default class GatewayService {
  /**
   * Registers a device and hands it its credential straight away.
   *
   * There is no approval step. A new device connects at once and starts out
   * unassigned: visible to staff, carrying nothing, until it is put into the
   * pool or a tenant claims it with its code. Open registration is therefore
   * harmless by itself; what a device may do is decided by its assignment.
   *
   * A device id that already exists is only refreshed when the request also
   * carries that device's token. Otherwise anyone who learned a phone's id
   * could register as it, receive its jobs and read the messages in them.
   */
  static async register(
    input: RegisterGatewayInput,
    options: { presentedBy?: Gateway | null; ctx?: HttpContext } = {}
  ): Promise<{ gateway: Gateway; token: string | null }> {
    const existing = await Gateway.findBy('deviceId', input.deviceId)

    if (existing) {
      if (!options.presentedBy || options.presentedBy.id !== existing.id) {
        throw new DomainException(
          ErrorCode.DEVICE_ALREADY_REGISTERED,
          'This device is already registered. Reconnect with its existing token, ' +
            'or ask an operator to remove it so it can register again.',
          { status: 409 }
        )
      }

      /**
       * An app upgrade re-announces the same device. Refreshing the hardware
       * facts is right; its assignment and credential stay as they were.
       */
      existing.merge({
        name: input.deviceName ?? existing.name,
        manufacturer: input.manufacturer ?? existing.manufacturer,
        model: input.model ?? existing.model,
        androidVersion: input.androidVersion ?? existing.androidVersion,
        appVersion: input.appVersion ?? existing.appVersion,
      })
      await existing.save()

      await this.logEvent(existing, 'registration.refreshed', {
        appVersion: input.appVersion ?? null,
      })

      return { gateway: existing, token: null }
    }

    const gateway = await this.createWithUniqueCode(input)

    const token = await Gateway.accessTokens.create(gateway, [...GATEWAY_ABILITIES], {
      name: `device:${gateway.deviceId}`,
    })

    await this.logEvent(gateway, 'registration.created', { deviceId: input.deviceId })
    await AuditService.record({
      action: AuditAction.GATEWAY_REGISTERED,
      actor: { type: ActorType.GATEWAY, id: gateway.id, label: gateway.deviceId },
      resourceType: 'gateway',
      resourceId: gateway.uid,
      metadata: { code: gateway.code },
      ctx: options.ctx,
    })

    return { gateway, token: token.value!.release() }
  }

  /**
   * Codes are random, so a collision is possible in principle. The unique
   * index catches it and a fresh code is drawn.
   */
  private static async createWithUniqueCode(input: RegisterGatewayInput): Promise<Gateway> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await Gateway.create({
          deviceId: input.deviceId,
          code: generateDeviceCode(),
          name: input.deviceName ?? input.model ?? 'Unnamed device',
          manufacturer: input.manufacturer ?? null,
          model: input.model ?? null,
          androidVersion: input.androidVersion ?? null,
          appVersion: input.appVersion ?? null,
          status: GatewayStatus.OFFLINE,
          assignment: GatewayAssignment.UNASSIGNED,
          priority: 100,
          maxInFlight: 1,
          isActive: true,
          createdAt: DateTime.now(),
        })
      } catch (error) {
        const code = (error as { code?: string }).code
        const constraint = (error as { constraint?: string }).constraint ?? ''
        if (code === '23505' && constraint.includes('code') && attempt < 5) continue
        throw error
      }
    }
  }

  /**
   * Removes a device and everything that lets it authenticate.
   *
   * For a phone that is decommissioned, lost, or has to register from scratch.
   * Its message history stays; it just no longer points at a device.
   */
  static async forget(gateway: Gateway): Promise<void> {
    const tokens = await Gateway.accessTokens.all(gateway)
    for (const token of tokens) {
      await Gateway.accessTokens.delete(gateway, token.identifier)
    }

    await gateway.delete()
  }

  /**
   * Records that a device opened a socket on this node.
   */
  static async markConnected(
    gateway: Gateway,
    options: { nodeId: string; ipAddress?: string | null; appVersion?: string | null }
  ): Promise<GatewaySession> {
    const now = DateTime.now()

    gateway.merge({
      status: GatewayStatus.ONLINE,
      nodeId: options.nodeId,
      lastConnectedAt: now,
      lastSeenAt: now,
      appVersion: options.appVersion ?? gateway.appVersion,
    })
    await gateway.save()

    const session = await GatewaySession.create({
      gatewayId: gateway.id,
      nodeId: options.nodeId,
      connectedAt: now,
      ipAddress: options.ipAddress ?? null,
      appVersion: options.appVersion ?? null,
    })

    await this.logEvent(gateway, 'connected', { nodeId: options.nodeId })
    await AuditService.record({
      action: AuditAction.GATEWAY_CONNECTED,
      actor: { type: ActorType.GATEWAY, id: gateway.id, label: gateway.deviceId },
      tenantId: gateway.tenantId,
      resourceType: 'gateway',
      resourceId: gateway.uid,
    })

    return session
  }

  /**
   * Records a disconnect.
   *
   * The gateway is only marked offline when this node still owns it. A device
   * that reconnected elsewhere in the meantime must not be knocked offline by
   * the late teardown of its previous socket.
   */
  static async markDisconnected(
    gatewayId: number,
    sessionId: number,
    options: { nodeId: string; reason: string }
  ): Promise<void> {
    await this.closeSession(sessionId, options.reason)

    const gateway = await Gateway.find(gatewayId)
    if (!gateway) return

    if (gateway.nodeId === options.nodeId) {
      gateway.merge({ status: GatewayStatus.OFFLINE, nodeId: null })
      await gateway.save()
    }

    await this.logEvent(gateway, 'disconnected', { reason: options.reason })
    await AuditService.record({
      action: AuditAction.GATEWAY_DISCONNECTED,
      actor: { type: ActorType.GATEWAY, id: gateway.id, label: gateway.deviceId },
      tenantId: gateway.tenantId,
      resourceType: 'gateway',
      resourceId: gateway.uid,
      metadata: { reason: options.reason },
    })
  }

  /**
   * Ends one session row without touching the gateway. Used on its own for a
   * socket that a newer connection from the same device replaced.
   */
  static async closeSession(sessionId: number, reason: string): Promise<void> {
    await GatewaySession.query()
      .where('id', sessionId)
      .whereNull('disconnected_at')
      .update({ disconnected_at: DateTime.now().toSQL(), disconnect_reason: reason.slice(0, 64) })
  }

  /**
   * Reconciles the SIM slots a device reports with the profiles we hold.
   *
   * Slots are matched by position rather than by identity so that swapping a
   * SIM updates the existing route (and keeps its history) instead of silently
   * creating a second one that nothing points at.
   */
  static async syncSimProfiles(gateway: Gateway, reported: ReportedSim[]): Promise<SimProfile[]> {
    const operators = await Operator.all()
    const profiles: SimProfile[] = []

    for (const sim of reported) {
      const operator =
        operators.find((candidate) => candidate.mcc === sim.mcc && candidate.mnc === sim.mnc) ??
        operators.find(
          (candidate) => candidate.name.toLowerCase() === (sim.operatorName ?? '').toLowerCase()
        ) ??
        null

      const profile = await SimProfile.updateOrCreate(
        { gatewayId: gateway.id, slot: sim.slot },
        {
          gatewayId: gateway.id,
          slot: sim.slot,
          operatorId: operator?.id ?? null,
          label: sim.operatorName ?? null,
          phoneNumber: sim.phoneNumber ?? null,
          imsiHash: sim.imsi ? this.hashIdentifier(sim.imsi) : null,
          iccidHash: sim.iccid ? this.hashIdentifier(sim.iccid) : null,
          state: sim.state ?? SimState.UNKNOWN,
          createdAt: DateTime.now(),
        }
      )

      profiles.push(profile)
    }

    /**
     * A slot the device no longer reports (SIM removed) must stop receiving
     * work, but the profile itself is kept so its history stays readable.
     */
    const reportedSlots = reported.map((sim) => sim.slot)
    if (reportedSlots.length > 0) {
      await SimProfile.query()
        .where('gateway_id', gateway.id)
        .whereNotIn('slot', reportedSlots)
        .update({ state: SimState.ABSENT })
    }

    return profiles
  }

  static async findByUid(uid: string): Promise<Gateway> {
    const gateway = await Gateway.findBy('uid', uid)
    if (!gateway) throw new NotFoundException('Gateway', uid)
    return gateway
  }

  static async logEvent(
    gateway: Gateway,
    event: string,
    payload: Record<string, unknown> | null = null,
    severity: 'info' | 'warning' | 'error' = 'info'
  ): Promise<void> {
    await GatewayEvent.create({
      gatewayId: gateway.id,
      event,
      severity,
      payload,
      createdAt: DateTime.now(),
    })
  }

  /**
   * Subscriber identifiers are stored hashed: they never need to be read back,
   * and they are damaging if a dump leaks.
   */
  private static hashIdentifier(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
