import vine from '@vinejs/vine'

const email = () => vine.string().email().maxLength(254)

/**
 * Validator to use before validating user credentials
 * during login
 */
export const loginValidator = vine.create({
  email: email(),
  password: vine.string(),
})
