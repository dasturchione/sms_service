import vine from '@vinejs/vine'
import { SimState } from '#enums/gateway_status'

/**
 * What a device announces about itself on first launch. Nothing here is
 * trusted for authorization: it only populates the record an operator looks at
 * before approving the phone.
 */
export const registerGatewayValidator = vine.create({
  deviceId: vine.string().trim().minLength(8).maxLength(128),
  deviceName: vine.string().trim().maxLength(120).optional(),
  manufacturer: vine.string().trim().maxLength(64).optional(),
  model: vine.string().trim().maxLength(64).optional(),
  androidVersion: vine.string().trim().maxLength(32).optional(),
  appVersion: vine.string().trim().maxLength(32).optional(),
})

export const claimGatewayValidator = vine.create({
  deviceId: vine.string().trim().minLength(8).maxLength(128),
  claimCode: vine.string().trim().minLength(8).maxLength(64),
})

/**
 * The SIM slots a device reports. Subscriber identifiers arrive in the clear
 * here and are hashed before storage.
 */
export const syncSimProfilesValidator = vine.create({
  sims: vine
    .array(
      vine.object({
        slot: vine.number().min(0).max(3),
        phoneNumber: vine.string().trim().maxLength(20).nullable().optional(),
        operatorName: vine.string().trim().maxLength(64).nullable().optional(),
        mcc: vine.string().trim().maxLength(4).nullable().optional(),
        mnc: vine.string().trim().maxLength(4).nullable().optional(),
        imsi: vine.string().trim().maxLength(32).nullable().optional(),
        iccid: vine.string().trim().maxLength(32).nullable().optional(),
        state: vine.enum(Object.values(SimState)).optional(),
      })
    )
    .minLength(1)
    .maxLength(4),
})

/**
 * Results delivered over HTTP instead of the socket. The device falls back to
 * this when its WebSocket is down, so a completed send is never lost just
 * because the link dropped at the wrong moment.
 */
export const reportResultsValidator = vine.create({
  results: vine
    .array(
      vine.object({
        jobId: vine.string().trim().maxLength(40),
        status: vine.enum(['sent', 'failed'] as const),
        providerMessageId: vine.string().trim().maxLength(128).nullable().optional(),
        errorCode: vine.string().trim().maxLength(48).nullable().optional(),
        errorMessage: vine.string().trim().maxLength(500).nullable().optional(),
        sentAt: vine.string().trim().maxLength(40).nullable().optional(),
      })
    )
    .minLength(1)
    .maxLength(100),
})
