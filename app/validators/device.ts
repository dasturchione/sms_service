import vine from '@vinejs/vine'

/**
 * The code exactly as read off the phone: `K7Q2-M9XD`, `k7q2m9xd`. Its format
 * is checked when the device is looked up.
 */
const code = () => vine.string().trim().minLength(8).maxLength(16)

const name = () => vine.string().trim().minLength(1).maxLength(64)

export const claimDeviceValidator = vine.create({
  code: code(),

  /**
   * A label for the tenant's own use, e.g. "Branch 3, front desk".
   */
  name: name().optional(),
})

export const updateDeviceValidator = vine.create({
  name: name().optional(),
})
