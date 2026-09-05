import vine from '@vinejs/vine'
import { UssdKind } from '#enums/ussd'

/**
 * The short code a message can be pinned to, e.g. `beeline`. Lowercase because
 * it is an identifier, not a label: `Beeline` and `beeline` must never be two
 * operators.
 */
const code = () =>
  vine
    .string()
    .trim()
    .toLowerCase()
    .minLength(2)
    .maxLength(32)
    .regex(/^[a-z0-9_-]+$/)

/**
 * National prefixes, without the country code. Used to prefer on-net routing,
 * which is why they are per operator data rather than a constant somewhere.
 */
const phonePrefixes = () =>
  vine
    .array(
      vine
        .string()
        .trim()
        .regex(/^\d{2,4}$/)
    )
    .distinct()

export const createOperatorValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(64),
  code: code(),
  country: vine.string().trim().fixedLength(2).toUpperCase().optional(),
  mcc: vine
    .string()
    .trim()
    .regex(/^\d{3}$/)
    .optional(),
  mnc: vine
    .string()
    .trim()
    .regex(/^\d{2,3}$/)
    .optional(),
  phonePrefixes: phonePrefixes().optional(),
  isActive: vine.boolean().optional(),
})

export const updateOperatorValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(64).optional(),
  country: vine.string().trim().fixedLength(2).toUpperCase().optional(),
  mcc: vine
    .string()
    .trim()
    .regex(/^\d{3}$/)
    .optional(),
  mnc: vine
    .string()
    .trim()
    .regex(/^\d{2,3}$/)
    .optional(),
  phonePrefixes: phonePrefixes().optional(),
  isActive: vine.boolean().optional(),
})

/**
 * A USSD code as dialled. Restricted to the characters a code can contain, so
 * a typo cannot turn into a dialled string that means something else on the
 * network.
 */
const ussdCommand = () =>
  vine
    .string()
    .trim()
    .maxLength(32)
    .regex(/^\*[\d*#]+#$/)

export const upsertUssdCommandValidator = vine.create({
  kind: vine.enum(Object.values(UssdKind)),
  command: ussdCommand(),

  /**
   * Replies to send when the code opens a menu, in order. They live here
   * rather than in the device build because a menu changing must be a row
   * update, not an APK rollout.
   */
  steps: vine.array(vine.string().trim().maxLength(16)).maxLength(5).optional(),

  /**
   * Which parser reads the answer. Validated against the registered parsers in
   * the controller, since an unknown key would store a code whose replies
   * nobody can read.
   */
  parserKey: vine.string().trim().maxLength(64),

  isActive: vine.boolean().optional(),
})

export const runUssdValidator = vine.create({
  kind: vine.enum(Object.values(UssdKind)),
})
