import type { HttpContext } from '@adonisjs/core/http'
import { listSmsValidator, sendSmsBatchValidator, sendSmsValidator } from '#validators/sms'
import SmsService from '#services/sms/sms_service'
import RateLimiter from '#services/infra/rate_limiter'
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

    await RateLimiter.consume(apiClient)

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

  /**
   * Accepts many messages at once.
   *
   * Answers 202 whatever the individual outcomes were: the request itself
   * succeeded, and per entry results are in the body. A batch where every
   * entry failed is still a well handled request, not a server error.
   */
  async storeBatch({ request, response, tenant, apiClient, serialize }: HttpContext) {
    const { messages } = await request.validateUsing(sendSmsBatchValidator)
    const idempotencyKey = request.header(IDEMPOTENCY_HEADER)?.slice(0, 128) ?? null

    /**
     * The whole batch is weighed against the allowance before anything is
     * written, so a client cannot slip past its limit by batching.
     */
    await RateLimiter.consume(apiClient, messages.length)

    const results = await SmsService.sendBatch(tenant, apiClient, messages, {
      idempotencyKey,
      ctx: request.ctx,
    })

    response.status(202)

    return serialize.withoutWrapping({
      data: results.map((result) => ({
        index: result.index,
        accepted: result.accepted,
        duplicate: result.duplicate ?? false,
        /**
         * Transformed directly rather than through `serialize`, which only
         * resolves transformers it finds at the top of the payload — these sit
         * one level inside an array of results.
         */
        message: result.message ? new SmsMessageTransformer(result.message).toObject() : null,
        error: result.error ?? null,
      })),
      meta: {
        accepted: results.filter((result) => result.accepted).length,
        rejected: results.filter((result) => !result.accepted).length,
      },
    })
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
