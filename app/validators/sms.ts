import vine from '@vinejs/vine'
import { SmsStatus } from '#enums/sms_status'

/**
 * Upper bound on a single message. Ten segments is already an unusual SMS and
 * an expensive one, so anything beyond it is far more likely to be a bug in
 * the caller than a real intent.
 */
export const MAX_SEGMENTS = 10

/**
 * Longest body that can possibly fit in MAX_SEGMENTS. The exact limit depends
 * on the encoding and is enforced after encoding; this only stops absurd
 * payloads before any work is done.
 */
const MAX_BODY_LENGTH = 1600

const priority = () => vine.enum(['high', 'normal', 'low'] as const)

export const sendSmsValidator = vine.create({
  to: vine.string().trim().minLength(4).maxLength(32),
  message: vine.string().minLength(1).maxLength(MAX_BODY_LENGTH),

  priority: priority().optional(),

  /**
   * Route through a specific operator, e.g. to keep an on-net message on-net.
   */
  operator: vine.string().trim().maxLength(32).optional(),

  /**
   * Route through one specific device. Mutually exclusive with `operator` in
   * practice; when both are given the gateway wins because it is the more
   * specific instruction.
   */
  gatewayUid: vine.string().trim().maxLength(40).optional(),

  /**
   * Seconds after which the message must not be sent any more. A one time
   * code delivered late is worse than one never delivered.
   */
  expiresIn: vine.number().min(30).max(86400).optional(),

  /**
   * Caller side identifier, echoed back on webhooks and searchable.
   */
  reference: vine.string().trim().maxLength(128).optional(),
})

/**
 * Upper bound on one batch. Large enough that a campaign is a handful of
 * calls, small enough that one request cannot hold a connection for minutes
 * or blow through a client's whole per minute allowance in one go.
 */
export const MAX_BATCH_SIZE = 100

export const sendSmsBatchValidator = vine.create({
  messages: vine
    .array(
      vine.object({
        to: vine.string().trim().minLength(4).maxLength(32),
        message: vine.string().minLength(1).maxLength(MAX_BODY_LENGTH),
        priority: priority().optional(),
        operator: vine.string().trim().maxLength(32).optional(),
        gatewayUid: vine.string().trim().maxLength(40).optional(),
        expiresIn: vine.number().min(30).max(86400).optional(),
        reference: vine.string().trim().maxLength(128).optional(),
      })
    )
    .minLength(1)
    .maxLength(MAX_BATCH_SIZE),
})

export const listSmsValidator = vine.create({
  status: vine.enum(Object.values(SmsStatus)).optional(),
  reference: vine.string().trim().maxLength(128).optional(),
  recipient: vine.string().trim().maxLength(32).optional(),
  from: vine.date().optional(),
  to: vine.date().optional(),
  limit: vine.number().min(1).max(200).optional(),

  /**
   * Keyset pagination cursor: the id of the last row of the previous page.
   * Offsets get slower the deeper a tenant pages, and shift when new messages
   * arrive mid-listing.
   */
  cursor: vine.string().trim().maxLength(32).optional(),
})
