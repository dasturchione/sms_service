import vine from '@vinejs/vine'

/**
 * A billing day, `YYYY-MM-DD`. Kept as a plain string rather than a parsed date
 * because the ledger is keyed by the operator's calendar date, and converting
 * through a timestamp is exactly how a day shifts by one across timezones.
 */
const day = () =>
  vine
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)

export const allowanceQueryValidator = vine.create({
  date: day().optional(),
})
