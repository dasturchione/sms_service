/**
 * Abilities stamped onto access tokens. The auth layer checks these, so an
 * API client that was never granted `sms:send` cannot send even with a valid
 * token.
 */
export const ClientAbility = {
  SMS_SEND: 'sms:send',
  SMS_READ: 'sms:read',
  SMS_CANCEL: 'sms:cancel',
  GATEWAY_READ: 'gateway:read',
  REPORT_READ: 'report:read',
  BALANCE_READ: 'balance:read',
  WEBHOOK_MANAGE: 'webhook:manage',
} as const

export type ClientAbility = (typeof ClientAbility)[keyof typeof ClientAbility]

export const CLIENT_ABILITIES: readonly ClientAbility[] = Object.values(ClientAbility)

/**
 * Default grant for a freshly created API client: it can send and inspect its
 * own traffic, nothing else.
 */
export const DEFAULT_CLIENT_ABILITIES: readonly ClientAbility[] = [
  ClientAbility.SMS_SEND,
  ClientAbility.SMS_READ,
]

/**
 * Device abilities. Deliberately disjoint from the client set so a leaked
 * phone token cannot be used to send messages through the tenant API.
 */
export const GatewayAbility = {
  CONNECT: 'gateway:connect',
  SMS_REPORT: 'sms:report',
  USSD_REPORT: 'ussd:report',
} as const

export type GatewayAbility = (typeof GatewayAbility)[keyof typeof GatewayAbility]

export const GATEWAY_ABILITIES: readonly GatewayAbility[] = Object.values(GatewayAbility)
