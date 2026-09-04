import vine from '@vinejs/vine'

/**
 * Credentials a tenant backend exchanges for an access token.
 */
export const clientTokenValidator = vine.create({
  clientId: vine.string().trim().minLength(8).maxLength(64),
  clientSecret: vine.string().minLength(16).maxLength(128),
})
