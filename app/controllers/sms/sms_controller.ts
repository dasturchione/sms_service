import type { HttpContext } from '@adonisjs/core/http'
import { listSmsValidator, sendSmsValidator } from '#validators/sms'
import SmsService from '#services/sms/sms_service'
import SmsMessageTransformer from '#transformers/sms_message_transformer'

/**
 * Header a caller sends to make a send safely repeatable. Retrying a request
 * that timed out is the normal case, not an edge case, and without this every
 * retry would be a second real SMS.
 */
const IDEMPOTENCY_HEADER = 'idempotency-key'

export default class SmsController {
  /**
   * Accepts a message. Responds 202 rather than 201 because acceptance is not
   * delivery: the platform has taken responsibility for the message, nothing
   * more.
   */
  async store({ request, response, tenant, apiClient, serialize }: HttpContext) {
    const payload = await request.validateUsing(sendSmsValidator)
    const idempotencyKey = request.header(IDEMPOTENCY_HEADER)?.slice(0, 128) ?? null

    const { message, duplicate } = await SmsService.send(tenant, apiClient, payload, {
      idempotencyKey,
      ctx: request.ctx,
    })

    /**
     * A replay returns 200 with the original message, so the caller can tell
     * "already accepted" apart from "accepted just now".
     */
    response.status(duplicate ? 200 : 202)

    return serialize(SmsMessageTransformer.transform(message))
  }

  async index({ request, tenant, serialize }: HttpContext) {
    const filters = await request.validateUsing(listSmsValidator)

    const { data, nextCursor } = await SmsService.listForTenant(tenant.id, filters)

    return serialize.withoutWrapping({
      data: SmsMessageTransformer.transform(data),
      meta: { nextCursor },
    })
  }

  async show({ params, tenant, serialize }: HttpContext) {
    const message = await SmsService.findForTenant(tenant.id, params.uid)

    return serialize(SmsMessageTransformer.transform(message))
  }

  async cancel({ params, request, tenant, apiClient, serialize }: HttpContext) {
    const message = await SmsService.cancel(tenant, params.uid, {
      apiClient,
      ctx: request.ctx,
    })

    return serialize(SmsMessageTransformer.transform(message))
  }
}
