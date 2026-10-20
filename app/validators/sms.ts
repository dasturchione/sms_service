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

/**
 * A device code as a person might type it: `K7Q2-M9XD`, `k7q2m9xd`. The exact
 * format is checked when the device is looked up.
 */
const deviceCode = () => vine.string().trim().minLength(8).maxLength(16)

/**
 * SIM slot index as Android reports it, starting at 0.
 */
const slot = () => vine.number().withoutDecimals().min(0).max(3)

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
   * One of the tenant's own devices, by the code shown on its screen
   * (`K7Q2-M9XD`). The message goes out through that phone and nowhere else,
   * waiting if it is offline. Without it, the shared pool is used.
   */
  device: deviceCode().optional(),

  /**
   * A SIM slot on that device. Without it, any usable slot of the device.
   */
  slot: slot().optional(),

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
        device: deviceCode().optional(),
        slot: slot().optional(),
        expiresIn: vine.number().min(30).max(86400).optional(),
        reference: vine.string().trim().maxLength(128).optional(),
      })
    )
    .minLength(1)
    .maxLength(MAX_BATCH_SIZE),
})

/**
 * Upper bound on one bulk request. Ten times the batch limit because a bulk
 * request is written with a handful of multi-row inserts, not one round trip
 * per entry.
 */
export const MAX_BULK_SIZE = 1000

/**
 * Many messages, each with its own number and its own text, e.g. a debt
 * reminder that names a different shop and amount for every customer.
 *
 * The body is either the array itself or `{ "messages": [...] }`, the same
 * envelope `/sms/batch` uses. The controller hands the array over under the
 * `messages` key in both cases.
 */
export const sendSmsBulkValidator = vine.create({
  messages: vine
    .array(
      vine.object({
        to: vine.string().trim().minLength(4).maxLength(32),
        message: vine.string().minLength(1).maxLength(MAX_BODY_LENGTH),
        priority: priority().optional(),
        operator: vine.string().trim().maxLength(32).optional(),
        gatewayUid: vine.string().trim().maxLength(40).optional(),
        device: deviceCode().optional(),
        slot: slot().optional(),
        expiresIn: vine.number().min(30).max(86400).optional(),
        reference: vine.string().trim().maxLength(128).optional(),
      })
    )
    .minLength(1)
    .maxLength(MAX_BULK_SIZE),
})

export const listSmsValidator = vine.create({
  status: vine.enum(Object.values(SmsStatus)).optional(),
  reference: vine.string().trim().maxLength(128).optional(),

  /**
   * Only messages sent through one of the tenant's own devices, by code.
   */
  device: deviceCode().optional(),
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
