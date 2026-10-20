import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import Gateway from '#models/gateway'
import type Tenant from '#models/tenant'
import SmsMessage from '#models/sms_message'
import GatewayService from '#services/gateway/gateway_service'
import GatewayPresenceService from '#services/gateway/gateway_presence_service'
import SmsService from '#services/sms/sms_service'
import WebhookService from '#services/webhooks/webhook_service'
import AuditService, { type AuditActor } from '#services/audit/audit_service'
import connectionManager from '#realtime/connection_manager'
import { ServerEvent } from '#realtime/protocol'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { GatewayAssignment } from '#enums/gateway_status'
import { AuditAction } from '#enums/audit_action'
import { SmsEvent } from '#enums/sms_event'
import { SmsStatus } from '#enums/sms_status'
import { WebhookEvent } from '#enums/webhook_event'
import { isDeviceCode, normalizeDeviceCode } from '#utils/device_code'

/**
 * Decides whose traffic a device carries.
 *
 * Every change of assignment goes through here, whether an operator makes it
 * from the panel or a tenant claims or releases its own phone, so the three
 * things that must happen together always do: the row changes, messages that
 * can no longer be carried are settled, and the phone is told.
 */
export default class GatewayAssignmentService {
  /**
   * Finds a device by the code shown on its screen. Unknown codes and codes
   * typed wrongly look the same to the caller.
   */
  static async findByCode(code: string): Promise<Gateway> {
    if (!isDeviceCode(code)) throw new NotFoundException('Device', code)

    const gateway = await Gateway.query().where('code', normalizeDeviceCode(code)).first()
    if (!gateway) throw new NotFoundException('Device', code)

    return gateway
  }

  /**
   * A tenant's own device by code, or a 404. Another tenant's device answers
   * exactly like a device that does not exist, so a code cannot be probed.
   */
  static async findOwned(tenantId: number, code: string): Promise<Gateway> {
    const gateway = await this.findByCode(code).catch(() => null)
    if (!gateway || !gateway.isOwnedBy(tenantId)) throw new NotFoundException('Device', code)

    return gateway
  }

  /**
   * A tenant takes an unassigned device as its own, using the code from the
   * phone's screen.
   *
   * Only an unassigned device can be claimed. Once claimed it is locked to
   * that tenant: knowing the code is no longer enough for anyone else.
   */
  static async claim(
    tenant: Tenant,
    code: string,
    options: { name?: string | null; actor: AuditActor; ctx?: HttpContext }
  ): Promise<Gateway> {
    const gateway = await this.findByCode(code)

    if (gateway.isOwnedBy(tenant.id)) return gateway

    if (gateway.assignment !== GatewayAssignment.UNASSIGNED) {
      throw new DomainException(
        ErrorCode.DEVICE_ALREADY_CLAIMED,
        'This device already belongs to someone. Ask its owner or the platform to release it.',
        { status: 409 }
      )
    }

    if (!gateway.isActive) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'This device has been disabled', {
        status: 409,
      })
    }

    await this.assign(gateway, GatewayAssignment.TENANT, tenant, {
      action: AuditAction.GATEWAY_CLAIMED,
      actor: options.actor,
      ctx: options.ctx,
    })

    if (options.name) {
      gateway.name = options.name
      await gateway.save()
    }

    return gateway
  }

  /**
   * A tenant gives its device back. It returns to unassigned and waits to be
   * claimed again.
   */
  static async release(
    tenant: Tenant,
    code: string,
    options: { actor: AuditActor; ctx?: HttpContext }
  ): Promise<Gateway> {
    const gateway = await this.findOwned(tenant.id, code)

    await this.assign(gateway, GatewayAssignment.UNASSIGNED, null, {
      action: AuditAction.GATEWAY_RELEASED,
      actor: options.actor,
      ctx: options.ctx,
    })

    return gateway
  }

  /**
   * Sets what a device is for.
   *
   * Messages a tenant pinned to this device can no longer be carried once it
   * stops being theirs, and they would otherwise wait forever. They are failed
   * here, with a reason, so the tenant hears about it instead of watching a
   * queue that never moves.
   */
  static async assign(
    gateway: Gateway,
    assignment: GatewayAssignment,
    tenant: Tenant | null,
    options: { action?: AuditAction; actor: AuditActor; ctx?: HttpContext }
  ): Promise<Gateway> {
    if (assignment === GatewayAssignment.TENANT && !tenant) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'A tenant is required', {
        status: 422,
      })
    }

    const previousTenantId =
      gateway.assignment === GatewayAssignment.TENANT ? gateway.tenantId : null
    const nextTenantId = assignment === GatewayAssignment.TENANT ? tenant!.id : null

    await db.transaction(async (trx) => {
      gateway.merge({ assignment, tenantId: nextTenantId })
      await gateway.useTransaction(trx).save()

      if (previousTenantId !== null && previousTenantId !== nextTenantId) {
        await this.failStrandedMessages(gateway, previousTenantId, trx)
      }
    })

    await GatewayService.logEvent(gateway, 'assigned', {
      assignment,
      tenantUid: tenant?.uid ?? null,
    })

    await AuditService.record({
      action: options.action ?? AuditAction.GATEWAY_ASSIGNED,
      actor: options.actor,
      tenantId: nextTenantId ?? previousTenantId,
      resourceType: 'gateway',
      resourceId: gateway.uid,
      metadata: { assignment, code: gateway.code, tenant: tenant?.uid ?? null },
      ctx: options.ctx,
    })

    await this.notifyDevice(gateway)

    return gateway
  }

  /**
   * Re-sends the device its session description, which carries its
   * assignment, so the screen on the phone changes the moment it is claimed.
   */
  static async notifyDevice(gateway: Gateway): Promise<void> {
    const connection = connectionManager.get(gateway.id)
    if (!connection) return

    await gateway.refresh()
    connection.send(
      ServerEvent.CONFIG_UPDATE,
      await GatewayPresenceService.describeSession(gateway)
    )
  }

  private static async failStrandedMessages(gateway: Gateway, tenantId: number, trx: any) {
    const stranded = await SmsMessage.query({ client: trx })
      .where('tenant_id', tenantId)
      .where('requested_gateway_id', gateway.id)
      .whereIn('status', [SmsStatus.CREATED, SmsStatus.QUEUED])
      .forUpdate()

    for (const message of stranded) {
      message.merge({
        status: SmsStatus.FAILED,
        errorCode: ErrorCode.DEVICE_RELEASED,
        errorMessage: `Device ${gateway.displayCode} no longer belongs to this account`,
        failedAt: DateTime.now(),
        dispatchBody: null,
      })
      await message.useTransaction(trx).save()

      await SmsService.recordEvent(
        message,
        SmsEvent.FAILED,
        { errorCode: ErrorCode.DEVICE_RELEASED },
        gateway.id,
        trx
      )
      await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_FAILED, { client: trx })
    }
  }
}
