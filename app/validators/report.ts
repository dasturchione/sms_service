import vine from '@vinejs/vine'

/**
 * Both bounds are optional so the common question — "how did the last month
 * go" — is a bare GET. Defaults are applied in the controller, where the
 * current date lives.
 */
export const reportRangeValidator = vine.create({
  from: vine.date({ formats: ['iso8601'] }).optional(),
  to: vine.date({ formats: ['iso8601'] }).optional(),
})
