export const UssdKind = {
  BALANCE: 'balance',
  SMS_BALANCE: 'sms_balance',
  INTERNET_BALANCE: 'internet_balance',
  PHONE_NUMBER: 'phone_number',
} as const

export type UssdKind = (typeof UssdKind)[keyof typeof UssdKind]

export const UssdStatus = {
  QUEUED: 'queued',
  SENDING: 'sending',
  SUCCESS: 'success',
  FAILED: 'failed',
  /**
   * The device reported that it cannot run USSD at all (OEM or carrier
   * restriction). The scheduler stops asking this SIM.
   */
  UNSUPPORTED: 'unsupported',
} as const

export type UssdStatus = (typeof UssdStatus)[keyof typeof UssdStatus]
