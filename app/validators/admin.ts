import vine from '@vinejs/vine'
import { CLIENT_ABILITIES } from '#enums/ability'
import { BodyRetention, TenantStatus, UserRole } from '#enums/tenant'
import { SmsStatus } from '#enums/sms_status'

/**
 * Tenant settings, as the panel edits them. Every field is optional and the
 * service merges rather than replaces, so a form that submits one knob cannot
 * reset the others.
 */
const tenantSettings = () =>
  vine
    .object({
      storeBody: vine.enum(Object.values(BodyRetention)).optional(),
      defaultMaxAttempts: vine.number().min(1).max(10).optional(),
      defaultExpiresInSeconds: vine.number().min(0).max(86400).optional(),
      lowBalanceThreshold: vine.number().min(0).max(1_000_000).optional(),
    })
    .optional()

export const createTenantValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(120),

  /**
   * Derived from the name when absent. Present in the API because a tenant
   * whose name contains an apostrophe deserves a slug someone chose.
   */
  slug: vine
    .string()
    .trim()
    .maxLength(120)
    .regex(/^[a-z0-9-]+$/)
    .optional(),

  settings: tenantSettings(),
})

export const updateTenantValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(120).optional(),
  status: vine.enum(Object.values(TenantStatus)).optional(),
  settings: tenantSettings(),
})

export const createApiClientValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(64),
  abilities: vine.array(vine.enum(CLIENT_ABILITIES)).distinct().minLength(1).optional(),
  rateLimitPerMin: vine.number().min(1).max(100_000).optional(),
})

export const updateApiClientValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(64).optional(),
  abilities: vine.array(vine.enum(CLIENT_ABILITIES)).distinct().minLength(1).optional(),
  rateLimitPerMin: vine.number().min(1).max(100_000).optional(),
  isActive: vine.boolean().optional(),
})

/**
 * The message explorer. Every filter is indexed or bounded by the cursor, so
 * an operator cannot accidentally ask for a table scan.
 */
export const searchMessagesValidator = vine.create({
  tenant: vine.string().trim().maxLength(40).optional(),
  status: vine.enum(Object.values(SmsStatus)).optional(),
  recipient: vine.string().trim().maxLength(32).optional(),
  reference: vine.string().trim().maxLength(128).optional(),
  gateway: vine.string().trim().maxLength(40).optional(),
  from: vine.date().optional(),
  to: vine.date().optional(),
  limit: vine.number().min(1).max(200).optional(),
  cursor: vine.string().trim().maxLength(32).optional(),
})

export const searchAuditValidator = vine.create({
  tenant: vine.string().trim().maxLength(40).optional(),
  action: vine.string().trim().maxLength(64).optional(),
  actorType: vine.string().trim().maxLength(32).optional(),
  resourceId: vine.string().trim().maxLength(64).optional(),
  limit: vine.number().min(1).max(200).optional(),
  cursor: vine.string().trim().maxLength(32).optional(),
})

/**
 * Fleet settings an operator may change from the panel. Deliberately narrow:
 * everything else about a device is reported by the device itself, and a field
 * the panel can overwrite is a field that will disagree with the phone.
 */
export const updateGatewayValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(64).optional(),

  /**
   * Lower wins. An operator's explicit priority outranks every routing
   * heuristic, which is the point of having it.
   */
  priority: vine.number().min(1).max(100).optional(),

  /**
   * How many messages the device may hold at once. Raising it past what a
   * phone can actually sustain turns latency into timeouts.
   */
  maxInFlight: vine.number().min(1).max(50).optional(),

  isActive: vine.boolean().optional(),
})

export const createStaffValidator = vine.create({
  fullName: vine.string().trim().maxLength(120).nullable().optional(),
  email: vine.string().email().maxLength(254),
  password: vine.string().minLength(8).maxLength(72),

  /**
   * Only these two can administer; a viewer account would authenticate and
   * then be refused by the guard, which is a worse experience than not being
   * offered the option.
   */
  role: vine.enum([UserRole.OWNER, UserRole.ADMIN]).optional(),
})

export const updateStaffValidator = vine.create({
  isActive: vine.boolean(),
})

export const adminReportValidator = vine.create({
  tenant: vine.string().trim().maxLength(40).optional(),
  from: vine.date().optional(),
  to: vine.date().optional(),
})

/**
 * Per SIM pacing and quotas. `state` is absent on purpose: that is the phone's
 * report of whether the card is readable, and a panel that could overwrite it
 * would let someone mark a missing SIM as ready and watch every message routed
 * to it fail.
 */
export const updateSimValidator = vine.create({
  label: vine.string().trim().maxLength(64).nullable().optional(),
  isActive: vine.boolean().optional(),

  /**
   * The spacing the dispatcher paces sends by. Operators cut off a SIM that
   * sends faster than a human plausibly could.
   */
  smsPerMinute: vine.number().min(1).max(600).optional(),

  /** Null lifts the cap entirely. */
  dailyQuota: vine.number().min(1).max(100_000).nullable().optional(),

  balanceCheckIntervalMin: vine.number().min(15).max(1440).optional(),

  /**
   * Only ever re-armed from here. The device is what turns it off, by saying
   * it cannot run USSD at all.
   */
  ussdSupported: vine.literal(true).optional(),
})

export const listJobsValidator = vine.create({
  status: vine.enum(['pending', 'running', 'failed']).optional(),
  queue: vine.string().trim().maxLength(48).optional(),
  limit: vine.number().min(1).max(200).optional(),
})
