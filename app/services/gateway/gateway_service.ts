import { DateTime } from 'luxon'
import { randomBytes } from 'node:crypto'
import { createHash } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import Gateway from '#models/gateway'
import GatewaySession from '#models/gateway_session'
import GatewayEvent from '#models/gateway_event'
import SimProfile from '#models/sim_profile'
import Operator from '#models/operator'
import type User from '#models/user'
import AuditService from '#services/audit/audit_service'
import gatewayConfig from '#config/gateway'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { GatewayStatus, SimState } from '#enums/gateway_status'
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
   * Registers a device, or refreshes the record of one already known.
   *
   * Deliberately open (no credential required) but deliberately powerless: a
   * freshly registered device is `pending_approval`, has no token and cannot
   * carry a single message until a human approves it. Anyone can announce a
   * phone; only an operator can put it to work.
   */
  static async register(input: RegisterGatewayInput, ctx?: HttpContext): Promise<Gateway> {
    const existing = await Gateway.findBy('deviceId', input.deviceId)

    if (existing) {
      /**
       * A reinstall or an app upgrade re-announces the same device. Refreshing
       * the hardware facts is right; resetting its approval would force an
       * operator to approve the same phone after every update.
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

      return existing
    }

    const gateway = await Gateway.create({
      deviceId: input.deviceId,
      name: input.deviceName ?? input.model ?? 'Unnamed device',
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      androidVersion: input.androidVersion ?? null,
      appVersion: input.appVersion ?? null,
      status: GatewayStatus.PENDING_APPROVAL,
      priority: 100,
      maxInFlight: 1,
      isActive: true,
      createdAt: DateTime.now(),
    })

    await this.logEvent(gateway, 'registration.created', { deviceId: input.deviceId })
    await AuditService.record({
      action: AuditAction.GATEWAY_REGISTERED,
      actor: { type: ActorType.GATEWAY, id: gateway.id, label: gateway.deviceId },
      resourceType: 'gateway',
      resourceId: gateway.uid,
      ctx,
    })

    return gateway
  }

  /**
   * Approves a device and issues a one-time claim code.
   *
   * The token is not handed out here: it is exchanged for the claim code by
   * the device itself. That way the credential is never sitting in an admin
   * screen, a chat message or a log.
   */
  static async approve(gateway: Gateway, approver: User, ctx?: HttpContext): Promise<string> {
    if (!gateway.isActive) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'This gateway is disabled', { status: 409 })
    }

    const claimCode = randomBytes(16).toString('base64url')

    gateway.merge({
      approvedAt: gateway.approvedAt ?? DateTime.now(),
      approvedBy: approver.id,
      status:
        gateway.status === GatewayStatus.PENDING_APPROVAL ? GatewayStatus.OFFLINE : gateway.status,
      claimCode: this.hashClaimCode(claimCode),
      claimCodeExpiresAt: DateTime.now().plus({
        minutes: gatewayConfig.provisioning.claimCodeTtlMinutes,
      }),
    })
    await gateway.save()

    await this.logEvent(gateway, 'approved', { approvedBy: approver.uid })
    await AuditService.record({
      action: AuditAction.GATEWAY_APPROVED,
      actor: { type: ActorType.USER, id: approver.id, label: approver.email },
      tenantId: gateway.tenantId,
      resourceType: 'gateway',
      resourceId: gateway.uid,
      ctx,
    })

    return claimCode
  }

  /**
   * Exchanges a claim code for a device access token.
   *
   * The code is single use and short lived, and is compared by hash so a
   * database read cannot reveal a code that is still valid.
   */
  static async claim(
    deviceId: string,
    claimCode: string
  ): Promise<{ gateway: Gateway; token: string }> {
    const gateway = await Gateway.findBy('deviceId', deviceId)

    if (!gateway || !gateway.claimCode || !gateway.claimCodeExpiresAt) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'No pending claim for this device', {
        status: 403,
      })
    }

    const expired = gateway.claimCodeExpiresAt.toMillis() <= Date.now()
    const matches = gateway.claimCode === this.hashClaimCode(claimCode)

    if (expired || !matches) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'The claim code is invalid or has expired', {
        status: 403,
      })
    }

    /**
     * A claimed device starts from a clean slate: any token from a previous
     * install is revoked, so a lost or stolen phone stops working the moment
     * the device is re-provisioned.
     */
    await Gateway.accessTokens
      .all(gateway)
      .then((tokens) =>
        Promise.all(tokens.map((token) => Gateway.accessTokens.delete(gateway, token.identifier)))
      )

    const token = await Gateway.accessTokens.create(gateway, [...GATEWAY_ABILITIES], {
      name: `device:${gateway.deviceId}`,
    })

    gateway.merge({ claimCode: null, claimCodeExpiresAt: null })
    await gateway.save()

    await this.logEvent(gateway, 'claimed', {})

    return { gateway, token: token.value!.release() }
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
    const now = DateTime.now()

    await GatewaySession.query()
      .where('id', sessionId)
      .whereNull('disconnected_at')
      .update({ disconnected_at: now.toSQL(), disconnect_reason: options.reason.slice(0, 64) })

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
   * Claim codes and subscriber identifiers are stored hashed. Neither needs to
   * be readable back, and both are damaging if a dump leaks.
   */
  private static hashClaimCode(code: string): string {
    return createHash('sha256').update(code).digest('hex')
  }

  private static hashIdentifier(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
