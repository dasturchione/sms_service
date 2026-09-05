import type { HttpContext } from '@adonisjs/core/http'
import ExplorerService from '#services/admin/explorer_service'
import SmsService from '#services/sms/sms_service'
import Tenant from '#models/tenant'
import AuditService from '#services/audit/audit_service'
import { NotFoundException } from '#exceptions/domain_exception'
import { ActorType, AuditAction } from '#enums/audit_action'
import SmsMessageTransformer from '#transformers/sms_message_transformer'
import AuditLogTransformer from '#transformers/audit_log_transformer'
import TenantTransformer from '#transformers/tenant_transformer'
import { searchAuditValidator, searchMessagesValidator } from '#validators/admin'

/**
 * Support's window onto the platform.
 *
 * Read-only on purpose: an operator investigating an incident must not be able
 * to change what they are looking at, and every action that *does* change
 * something has its own endpoint and its own audit entry.
 */
export default class AdminExplorerController {
  async messages({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(searchMessagesValidator)
    const { data, tenants, nextCursor } = await ExplorerService.messages(filters)

    return serialize.withoutWrapping({
      data: data.map((message) => ({
        ...new SmsMessageTransformer(message).toObject(),

        /**
         * Which tenant sent it: the first thing support needs and the one
         * thing the tenant-facing shape has no reason to carry.
         */
        tenant: tenants[message.tenantId] ?? null,
      })),
      meta: { nextCursor },
    })
  }

  async message({ params, serialize }: HttpContext) {
    const { message, events, attempts, tenant } = await ExplorerService.message(params.uid)

    return serialize({
      message: SmsMessageTransformer.transform(message),
      tenant: tenant ? TenantTransformer.transform(tenant) : null,

      /**
       * Which device and SIM each try went through. The timeline says what
       * happened; this says who it happened on.
       */
      attempts: attempts.map((attempt) => ({
        attemptNo: attempt.attemptNo,
        status: attempt.status,
        gatewayId: attempt.gatewayId,
        simProfileId: attempt.simProfileId,
        error:
          attempt.errorCode === null
            ? null
            : { code: attempt.errorCode, message: attempt.errorMessage },
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        durationMs: attempt.durationMs,
      })),

      /**
       * The timeline is the point of this endpoint: "why did this code arrive
       * eleven minutes late" is answered by the events, not by the row.
       */
      events: events.map((event) => ({
        event: event.event,
        payload: event.payload,
        at: event.createdAt,
      })),
    })
  }

  /**
   * Cancels a message on a tenant's behalf.
   *
   * The one write on this screen, and it exists because support is asked for
   * it: a tenant floods its own queue by mistake and cannot reach its own API
   * fast enough. It goes through the same service the tenant API uses, so a
   * message already handed to a device is refused here exactly as it would be
   * there — nothing can be recalled from a phone.
   */
  async cancelMessage({ auth, params, request, serialize }: HttpContext) {
    const user = auth.use('api').getUserOrFail()

    const { message } = await ExplorerService.message(params.uid)
    const tenant = await Tenant.find(message.tenantId)

    if (!tenant) throw new NotFoundException('Tenant', String(message.tenantId))

    const cancelled = await SmsService.cancel(tenant, message.uid, { ctx: request.ctx })

    await AuditService.record({
      action: AuditAction.SMS_CANCELLED,
      actor: { type: ActorType.USER, id: user.id, label: user.email },
      tenantId: tenant.id,
      resourceType: 'sms_message',
      resourceId: cancelled.uid,
      metadata: { byOperator: true },
      ctx: request.ctx,
    })

    return serialize(SmsMessageTransformer.transform(cancelled))
  }

  async audit({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(searchAuditValidator)
    const { data, nextCursor } = await ExplorerService.audit(filters)

    return serialize.withoutWrapping({
      data: AuditLogTransformer.transform(data),
      meta: { nextCursor },
    })
  }
}
