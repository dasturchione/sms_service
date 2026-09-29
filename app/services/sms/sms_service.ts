import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import SmsMessage from '#models/sms_message'
import SmsEventLog from '#models/sms_event_log'
import Operator from '#models/operator'
import Gateway from '#models/gateway'
import type ApiClient from '#models/api_client'
import type Tenant from '#models/tenant'
import AuditService from '#services/audit/audit_service'
import QueueSignal from '#services/infra/queue_signal'
import WebhookService from '#services/webhooks/webhook_service'
import { normalizePhoneNumber, tryNormalizePhoneNumber } from '#services/sms/phone_normalizer'
import { encodeMessage } from '#services/sms/message_encoder'
import { bodyForStorage, hashBody } from '#services/sms/body_policy'
import DomainException, {
  IdempotencyConflictException,
  NotFoundException,
} from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { SmsEvent } from '#enums/sms_event'
import { WebhookEvent } from '#enums/webhook_event'
import { CANCELLABLE_SMS_STATUSES, SmsPriority, SmsStatus } from '#enums/sms_status'
import { ActorType, AuditAction } from '#enums/audit_action'
import { MAX_SEGMENTS } from '#validators/sms'
import { generateUid } from '#utils/uid'

/**
 * Postgres unique violation. Raised when two concurrent requests carry the
 * same idempotency key and both pass the pre-check.
 */
const PG_UNIQUE_VIOLATION = '23505'

/**
 * Rows per multi-row INSERT. Postgres caps a statement at 65535 bind
 * parameters; a message row has about twenty columns, so this stays far below
 * the cap while keeping a thousand entry request to two statements.
 */
const BULK_INSERT_CHUNK = 500

export type SendSmsInput = {
  to: string
  message: string
  priority?: 'high' | 'normal' | 'low'
  operator?: string
  gatewayUid?: string
  expiresIn?: number
  reference?: string
}

export type SendSmsResult = {
  message: SmsMessage
  /** True when an existing message was returned instead of creating one. */
  duplicate: boolean
}

export type BatchSendResult = {
  index: number
  accepted: boolean
  duplicate?: boolean
  message?: SmsMessage
  error?: { code: string; message: string; details: Record<string, unknown> }
}

export type BulkSendResult = {
  /** Position in the request array, so the caller can map results back. */
  index: number
  /** The number exactly as the caller sent it, trimmed. */
  to: string
  accepted: boolean
  duplicate: boolean
  message?: SmsMessage
  error?: { code: string; message: string; details: Record<string, unknown> }
}

/**
 * An entry that passed validation and is about to be written, with every
 * column that differs between entries already worked out.
 */
type PendingBulkEntry = {
  index: number
  to: string
  e164: string
  uid: string
  idempotencyKey: string | null
  input: SendSmsInput
  encoded: ReturnType<typeof encodeMessage>
  bodyHash: string
  requestedOperatorId: number | null
  requestedGatewayId: number | null
}

export type ListSmsFilters = {
  status?: SmsStatus
  reference?: string
  recipient?: string
  from?: DateTime
  to?: DateTime
  limit?: number
  cursor?: string
}

/**
 * Owns the write side of the message lifecycle.
 *
 * Every method takes the tenant explicitly rather than reading it from an HTTP
 * context. The same code is called by controllers and, from M2 onwards, by
 * queue workers that have no request to read from.
 */
export default class SmsService {
  /**
   * Accepts a message for delivery.
   *
   * The HTTP request never waits for a device: the message is persisted,
   * marked queued and returned. Actual dispatch happens out of band, so a slow
   * or offline gateway can never turn into a slow API.
   */
  static async send(
    tenant: Tenant,
    apiClient: ApiClient | null,
    input: SendSmsInput,
    options: { idempotencyKey?: string | null; ctx?: HttpContext } = {}
  ): Promise<SendSmsResult> {
    const recipient = normalizePhoneNumber(input.to)
    const encoded = encodeMessage(input.message)
    this.assertSegments(encoded)

    const bodyHash = hashBody(input.message)
    const idempotencyKey = options.idempotencyKey ?? null

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(tenant.id, idempotencyKey)
      if (existing) {
        this.assertSamePayload(existing, recipient.e164, bodyHash, idempotencyKey)
        return { message: existing, duplicate: true }
      }
    }

    const settings = tenant.resolvedSettings
    const requestedOperator = await this.resolveOperator(input.operator)
    const requestedGateway = await this.resolveGateway(tenant.id, input.gatewayUid)

    const expiresInSeconds = input.expiresIn ?? settings.defaultExpiresInSeconds
    const now = DateTime.now()
    const priorityName = (input.priority ?? 'normal').toUpperCase() as 'HIGH' | 'NORMAL' | 'LOW'

    const attributes = {
      tenantId: tenant.id,
      apiClientId: apiClient?.id ?? null,
      idempotencyKey,
      reference: input.reference ?? null,
      recipient: input.to.trim(),
      recipientNormalized: recipient.e164,
      messageBody: bodyForStorage(input.message, settings),
      /**
       * Erased once the message settles; see the `dispatch_body` migration.
       */
      dispatchBody: input.message,
      bodyHash,
      segments: encoded.segments,
      encoding: encoded.encoding,
      status: SmsStatus.QUEUED,
      priority: SmsPriority[priorityName],
      attempts: 0,
      maxAttempts: settings.defaultMaxAttempts,
      requestedOperatorId: requestedOperator?.id ?? null,
      requestedGatewayId: requestedGateway?.id ?? null,
      expiresAt: expiresInSeconds > 0 ? now.plus({ seconds: expiresInSeconds }) : null,
      queuedAt: now,
    }

    let message: SmsMessage
    try {
      message = await SmsMessage.create(attributes)
    } catch (error) {
      /**
       * Two identical requests raced past the pre-check. The database settled
       * it; whoever lost returns the winner's message rather than failing, so
       * the caller still gets exactly-once semantics.
       */
      if (idempotencyKey && this.isUniqueViolation(error)) {
        const winner = await this.findByIdempotencyKey(tenant.id, idempotencyKey)
        if (winner) {
          this.assertSamePayload(winner, recipient.e164, bodyHash, idempotencyKey)
          return { message: winner, duplicate: true }
        }
      }
      throw error
    }

    /**
     * Columns filled in by database defaults are not present on the instance
     * returned by `create`. Without this reload the response to a send would
     * be shaped differently from the response to a read of the same message,
     * and callers would have to handle both.
     */
    await message.refresh()

    await this.recordEvent(message, SmsEvent.CREATED)
    await this.recordEvent(message, SmsEvent.QUEUED)

    await AuditService.record({
      action: AuditAction.SMS_CREATED,
      actor: apiClient
        ? { type: ActorType.API_CLIENT, id: apiClient.id, label: apiClient.clientId }
        : { type: ActorType.SYSTEM },
      tenantId: tenant.id,
      resourceType: 'sms_message',
      resourceId: message.uid,
      metadata: {
        recipient: recipient.e164,
        segments: encoded.segments,
        encoding: encoded.encoding,
      },
      ctx: options.ctx,
    })

    /**
     * Nudges the dispatcher so an accepted message goes out immediately
     * instead of waiting for the next poll.
     */
    await QueueSignal.notify()

    return { message, duplicate: false }
  }

  /**
   * Accepts many messages in one request.
   *
   * Each entry is independent: one bad number does not reject the other
   * ninety nine. The alternative — all or nothing — sounds tidier but is
   * wrong for this domain, since a caller sending a campaign wants the
   * ninety nine to go out and a list of the ones that did not.
   */
  static async sendBatch(
    tenant: Tenant,
    apiClient: ApiClient | null,
    messages: SendSmsInput[],
    options: { idempotencyKey?: string | null; ctx?: HttpContext } = {}
  ): Promise<BatchSendResult[]> {
    const results: BatchSendResult[] = []

    for (const [index, input] of messages.entries()) {
      try {
        const { message, duplicate } = await this.send(tenant, apiClient, input, {
          /**
           * The batch key is per request, so each entry gets its own derived
           * key. Without the index a retried batch would collapse into a
           * single message.
           */
          idempotencyKey: options.idempotencyKey ? `${options.idempotencyKey}:${index}` : null,
          ctx: options.ctx,
        })

        results.push({ index, accepted: true, duplicate, message })
      } catch (error) {
        /**
         * A per entry failure is data, not an exception: it is reported in the
         * response next to the entries that succeeded.
         */
        if (error instanceof DomainException) {
          results.push({
            index,
            accepted: false,
            error: { code: error.code, message: error.message, details: error.details },
          })
          continue
        }

        throw error
      }
    }

    return results
  }

  /**
   * Accepts many messages, each with its own number and text, in one request.
   *
   * Same contract as `sendBatch` (every entry stands on its own, one bad entry
   * never costs the others) but a different cost: `sendBatch` runs the full
   * single send path per entry, several round trips each, while this
   * validates everything in memory and writes all accepted messages with a
   * few multi-row inserts in one transaction.
   *
   * The transaction makes acceptance all or nothing for the valid entries, so
   * the caller never ends up with half its list queued and no response saying
   * which half.
   */
  static async sendBulk(
    tenant: Tenant,
    apiClient: ApiClient | null,
    messages: SendSmsInput[],
    options: { idempotencyKey?: string | null; ctx?: HttpContext } = {}
  ): Promise<BulkSendResult[]> {
    const results: BulkSendResult[] = []
    const pending: PendingBulkEntry[] = []
    const firstIndexByContent = new Map<string, number>()

    /**
     * A campaign usually names one operator or gateway, if any, for all of
     * its entries. Each distinct value is looked up once, not once per entry.
     */
    const operators = new Map<string, Promise<Operator | null>>()
    const gateways = new Map<string, Promise<Gateway | null>>()

    for (const [index, input] of messages.entries()) {
      const to = input.to.trim()
      const reject = (code: string, message: string, details: Record<string, unknown> = {}) => {
        results[index] = this.rejectedEntry(index, to, code, { message, details })
      }

      const recipient = tryNormalizePhoneNumber(to)
      if (!recipient) {
        reject(ErrorCode.INVALID_NUMBER, 'The recipient number is not a valid phone number', {
          recipient: to,
        })
        continue
      }

      const encoded = encodeMessage(input.message)
      if (encoded.segments > MAX_SEGMENTS) {
        reject(
          ErrorCode.MESSAGE_TOO_LONG,
          `The message would be split into ${encoded.segments} segments, the limit is ${MAX_SEGMENTS}`,
          { segments: encoded.segments, encoding: encoded.encoding }
        )
        continue
      }

      const bodyHash = hashBody(input.message)

      /**
       * Only the same number with the same text is a duplicate. One customer
       * may legitimately get two different reminders in one request; the
       * same text twice is a mistake that costs real money.
       */
      const contentKey = `${recipient.e164}:${bodyHash}`
      const firstIndex = firstIndexByContent.get(contentKey)
      if (firstIndex !== undefined) {
        reject(
          ErrorCode.DUPLICATE_RECIPIENT,
          'The same message to this number already appears earlier in the request',
          { firstIndex }
        )
        continue
      }

      let requestedOperatorId: number | null = null
      if (input.operator) {
        const code = input.operator.toLowerCase()
        if (!operators.has(code)) {
          operators.set(code, Operator.query().where('code', code).first())
        }
        const operator = await operators.get(code)!
        if (!operator) {
          reject(ErrorCode.OPERATOR_NOT_FOUND, `Unknown operator "${input.operator}"`)
          continue
        }
        requestedOperatorId = operator.id
      }

      let requestedGatewayId: number | null = null
      if (input.gatewayUid) {
        if (!gateways.has(input.gatewayUid)) {
          gateways.set(
            input.gatewayUid,
            Gateway.query()
              .where('uid', input.gatewayUid)
              .where((builder) => builder.whereNull('tenant_id').orWhere('tenant_id', tenant.id))
              .first()
          )
        }
        const gateway = await gateways.get(input.gatewayUid)!
        if (!gateway) {
          reject(ErrorCode.GATEWAY_NOT_FOUND, `Unknown gateway "${input.gatewayUid}"`)
          continue
        }
        requestedGatewayId = gateway.id
      }

      firstIndexByContent.set(contentKey, index)

      pending.push({
        index,
        to,
        e164: recipient.e164,
        uid: generateUid('sms'),
        /**
         * Derived per entry exactly like `sendBatch`, so a retried request
         * maps onto the messages the first one created.
         */
        idempotencyKey: options.idempotencyKey ? `${options.idempotencyKey}:${index}` : null,
        input,
        encoded,
        bodyHash,
        requestedOperatorId,
        requestedGatewayId,
      })
    }

    let written: PendingBulkEntry[] = []

    /**
     * One retry covers the race where a concurrent replay of the same request
     * commits first: the second pass finds those rows in the idempotency check
     * and returns them instead of failing.
     */
    for (let pass = 0; ; pass++) {
      const remaining = await this.resolveBulkReplays(tenant.id, pending, results)

      try {
        const created = await this.insertBulk(tenant, apiClient, remaining)

        const byUid = new Map(created.map((message) => [message.uid, message]))
        for (const entry of remaining) {
          results[entry.index] = {
            index: entry.index,
            to: entry.to,
            accepted: true,
            duplicate: false,
            message: byUid.get(entry.uid),
          }
        }

        written = remaining
        break
      } catch (error) {
        if (pass === 0 && options.idempotencyKey && this.isUniqueViolation(error)) continue
        throw error
      }
    }

    if (written.length > 0) {
      await AuditService.record({
        action: AuditAction.SMS_BULK_CREATED,
        actor: apiClient
          ? { type: ActorType.API_CLIENT, id: apiClient.id, label: apiClient.clientId }
          : { type: ActorType.SYSTEM },
        tenantId: tenant.id,
        resourceType: 'sms_bulk',
        metadata: {
          requested: messages.length,
          accepted: written.length,
          segments: written.reduce((total, entry) => total + entry.encoded.segments, 0),
        },
        ctx: options.ctx,
      })

      /**
       * One nudge for the whole request. The dispatcher drains the queue in a
       * loop, so a notification per message would only wake it again for
       * work it is already doing.
       */
      await QueueSignal.notify()
    }

    return results
  }

  /**
   * Fills in the result for entries whose idempotency key was already used
   * and returns the ones that still need writing. One query for the whole
   * request rather than one per entry.
   */
  private static async resolveBulkReplays(
    tenantId: number,
    pending: PendingBulkEntry[],
    results: BulkSendResult[]
  ): Promise<PendingBulkEntry[]> {
    const keys = pending
      .map((entry) => entry.idempotencyKey)
      .filter((key): key is string => key !== null)

    if (keys.length === 0) return pending

    const existing = await SmsMessage.query()
      .where('tenant_id', tenantId)
      .whereIn('idempotency_key', keys)

    if (existing.length === 0) return pending

    const byKey = new Map(existing.map((message) => [message.idempotencyKey, message]))

    return pending.filter((entry) => {
      const found = byKey.get(entry.idempotencyKey)
      if (!found) return true

      if (found.recipientNormalized !== entry.e164 || found.bodyHash !== entry.bodyHash) {
        results[entry.index] = this.rejectedEntry(
          entry.index,
          entry.to,
          ErrorCode.IDEMPOTENCY_CONFLICT,
          {
            message: 'Idempotency key was already used with a different payload',
            details: { idempotencyKey: entry.idempotencyKey },
          }
        )
      } else {
        results[entry.index] = {
          index: entry.index,
          to: entry.to,
          accepted: true,
          duplicate: true,
          message: found,
        }
      }

      return false
    })
  }

  /**
   * Writes the messages and their first two timeline events in one
   * transaction, then reads the rows back so the response has the same shape
   * as a read of the same message, database defaults included.
   */
  private static async insertBulk(
    tenant: Tenant,
    apiClient: ApiClient | null,
    entries: PendingBulkEntry[]
  ): Promise<SmsMessage[]> {
    if (entries.length === 0) return []

    const settings = tenant.resolvedSettings
    const now = DateTime.now()
    const nowSql = now.toJSDate()

    const rows = entries.map((entry) => {
      const expiresInSeconds = entry.input.expiresIn ?? settings.defaultExpiresInSeconds
      const priorityName = (entry.input.priority ?? 'normal').toUpperCase() as
        'HIGH' | 'NORMAL' | 'LOW'

      return {
        uid: entry.uid,
        tenant_id: tenant.id,
        api_client_id: apiClient?.id ?? null,
        idempotency_key: entry.idempotencyKey,
        reference: entry.input.reference ?? null,
        recipient: entry.to,
        recipient_normalized: entry.e164,
        message_body: bodyForStorage(entry.input.message, settings),
        /**
         * Erased once the message settles; see the `dispatch_body` migration.
         */
        dispatch_body: entry.input.message,
        body_hash: entry.bodyHash,
        segments: entry.encoded.segments,
        encoding: entry.encoded.encoding,
        status: SmsStatus.QUEUED,
        priority: SmsPriority[priorityName],
        attempts: 0,
        max_attempts: settings.defaultMaxAttempts,
        requested_operator_id: entry.requestedOperatorId,
        requested_gateway_id: entry.requestedGatewayId,
        expires_at:
          expiresInSeconds > 0 ? now.plus({ seconds: expiresInSeconds }).toJSDate() : null,
        queued_at: nowSql,
        created_at: nowSql,
        updated_at: nowSql,
      }
    })

    return db.transaction(async (trx) => {
      const ids: (string | number)[] = []

      for (const chunk of chunked(rows, BULK_INSERT_CHUNK)) {
        const inserted: { id: string | number }[] = await trx
          .insertQuery()
          .table('sms_messages')
          .multiInsert(chunk)
          .returning('id')

        ids.push(...inserted.map((row) => row.id))
      }

      const events = ids.flatMap((id) =>
        [SmsEvent.CREATED, SmsEvent.QUEUED].map((event) => ({
          sms_message_id: id,
          event,
          gateway_id: null,
          payload: null,
          created_at: nowSql,
        }))
      )

      for (const chunk of chunked(events, BULK_INSERT_CHUNK)) {
        await trx.insertQuery().table('sms_events').multiInsert(chunk)
      }

      return SmsMessage.query({ client: trx }).whereIn('id', ids)
    })
  }

  private static rejectedEntry(
    index: number,
    to: string,
    code: string,
    error: { message: string; details?: Record<string, unknown> }
  ): BulkSendResult {
    return {
      index,
      to,
      accepted: false,
      duplicate: false,
      error: { code, message: error.message, details: error.details ?? {} },
    }
  }

  private static assertSegments(encoded: ReturnType<typeof encodeMessage>): void {
    if (encoded.segments > MAX_SEGMENTS) {
      throw new DomainException(
        ErrorCode.MESSAGE_TOO_LONG,
        `The message would be split into ${encoded.segments} segments, the limit is ${MAX_SEGMENTS}`,
        { status: 422, details: { segments: encoded.segments, encoding: encoded.encoding } }
      )
    }
  }

  /**
   * Reads one message. The tenant is part of the lookup rather than checked
   * afterwards, so a wrong tenant produces a plain 404 and leaks nothing about
   * whether the uid exists.
   */
  static async findForTenant(tenantId: number, uid: string): Promise<SmsMessage> {
    const message = await SmsMessage.query().where('tenant_id', tenantId).where('uid', uid).first()

    if (!message) {
      throw new NotFoundException('Message', uid)
    }

    return message
  }

  static async listForTenant(tenantId: number, filters: ListSmsFilters = {}) {
    const limit = filters.limit ?? 50
    const query = SmsMessage.query().where('tenant_id', tenantId)

    if (filters.status) query.where('status', filters.status)
    if (filters.reference) query.where('reference', filters.reference)
    if (filters.recipient) {
      query.where('recipient_normalized', normalizePhoneNumber(filters.recipient).e164)
    }
    if (filters.from) query.where('created_at', '>=', filters.from.toSQL()!)
    if (filters.to) query.where('created_at', '<=', filters.to.toSQL()!)

    /**
     * Keyset pagination: ids are monotonic, so "everything before this id" is
     * both stable while new messages arrive and cheap at any depth.
     */
    if (filters.cursor) query.where('id', '<', filters.cursor)

    const rows = await query.orderBy('id', 'desc').limit(limit + 1)
    const hasMore = rows.length > limit
    const data = hasMore ? rows.slice(0, limit) : rows

    return {
      data,
      nextCursor: hasMore ? String(data[data.length - 1].id) : null,
    }
  }

  /**
   * Cancels a message that has not left the platform yet. A message already
   * handed to a device cannot be recalled, so those are refused rather than
   * marked cancelled and quietly delivered anyway.
   */
  static async cancel(
    tenant: Tenant,
    uid: string,
    options: { apiClient?: ApiClient | null; ctx?: HttpContext } = {}
  ): Promise<SmsMessage> {
    const message = await this.findForTenant(tenant.id, uid)

    if (!CANCELLABLE_SMS_STATUSES.includes(message.status)) {
      throw new DomainException(
        ErrorCode.FORBIDDEN,
        `A message in status "${message.status}" can no longer be cancelled`,
        { status: 409, details: { status: message.status } }
      )
    }

    message.status = SmsStatus.CANCELLED
    message.errorCode = ErrorCode.CANCELLED_BY_CLIENT
    message.failedAt = DateTime.now()
    await message.save()

    await this.recordEvent(message, SmsEvent.CANCELLED)
    await AuditService.record({
      action: AuditAction.SMS_CANCELLED,
      actor: options.apiClient
        ? {
            type: ActorType.API_CLIENT,
            id: options.apiClient.id,
            label: options.apiClient.clientId,
          }
        : { type: ActorType.SYSTEM },
      tenantId: tenant.id,
      resourceType: 'sms_message',
      resourceId: message.uid,
      ctx: options.ctx,
    })

    await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_CANCELLED)

    return message
  }

  /**
   * Appends to the message timeline. Every status change goes through here so
   * `sms_events` stays a complete trace.
   */
  static async recordEvent(
    message: SmsMessage,
    event: SmsEvent,
    payload: Record<string, unknown> | null = null,
    gatewayId: number | null = null,
    client?: TransactionClientContract
  ): Promise<void> {
    const log = new SmsEventLog().fill({
      smsMessageId: message.id,
      event,
      gatewayId,
      payload,
      createdAt: DateTime.now(),
    })

    /**
     * When a caller is inside a transaction the event must join it, otherwise
     * a rolled back state change would leave a timeline entry claiming it
     * happened.
     */
    if (client) log.useTransaction(client)

    await log.save()
  }

  private static async findByIdempotencyKey(tenantId: number, key: string) {
    return SmsMessage.query().where('tenant_id', tenantId).where('idempotency_key', key).first()
  }

  /**
   * A replayed key must describe the same message. Silently returning the
   * original for a different payload would drop a real message.
   */
  private static assertSamePayload(
    existing: SmsMessage,
    recipient: string,
    bodyHash: string,
    key: string
  ): void {
    if (existing.recipientNormalized !== recipient || existing.bodyHash !== bodyHash) {
      throw new IdempotencyConflictException(key)
    }
  }

  private static async resolveOperator(code?: string): Promise<Operator | null> {
    if (!code) return null

    const operator = await Operator.query().where('code', code.toLowerCase()).first()
    if (!operator) {
      throw new DomainException(ErrorCode.OPERATOR_NOT_FOUND, `Unknown operator "${code}"`, {
        status: 422,
      })
    }
    return operator
  }

  /**
   * A tenant may only pin a message to a device that actually serves it:
   * either a shared pool device or one dedicated to that tenant.
   */
  private static async resolveGateway(tenantId: number, uid?: string): Promise<Gateway | null> {
    if (!uid) return null

    const gateway = await Gateway.query()
      .where('uid', uid)
      .where((builder) => builder.whereNull('tenant_id').orWhere('tenant_id', tenantId))
      .first()

    if (!gateway) {
      throw new DomainException(ErrorCode.GATEWAY_NOT_FOUND, `Unknown gateway "${uid}"`, {
        status: 422,
      })
    }
    return gateway
  }

  private static isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === PG_UNIQUE_VIOLATION
    )
  }
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}
