export const ActorType = {
  USER: 'user',
  API_CLIENT: 'api_client',
  GATEWAY: 'gateway',
  SYSTEM: 'system',
} as const

export type ActorType = (typeof ActorType)[keyof typeof ActorType]

export const AuditAction = {
  // Authentication
  API_AUTHENTICATED: 'api.authenticated',
  API_AUTH_FAILED: 'api.auth_failed',
  TOKEN_ISSUED: 'token.issued',
  TOKEN_ROTATED: 'token.rotated',
  TOKEN_REVOKED: 'token.revoked',

  // Messages
  SMS_CREATED: 'sms.created',
  SMS_ASSIGNED: 'sms.assigned',
  SMS_SENT: 'sms.sent',
  SMS_FAILED: 'sms.failed',
  SMS_CANCELLED: 'sms.cancelled',

  // Devices
  GATEWAY_REGISTERED: 'gateway.registered',
  GATEWAY_APPROVED: 'gateway.approved',
  GATEWAY_CONNECTED: 'gateway.connected',
  GATEWAY_DISCONNECTED: 'gateway.disconnected',
  GATEWAY_DISABLED: 'gateway.disabled',
  GATEWAY_REVOKED: 'gateway.revoked',

  // USSD
  USSD_REQUESTED: 'ussd.requested',
  USSD_COMPLETED: 'ussd.completed',
  USSD_FAILED: 'ussd.failed',

  // Administration
  TENANT_CREATED: 'tenant.created',
  TENANT_UPDATED: 'tenant.updated',
  API_CLIENT_CREATED: 'api_client.created',
  API_CLIENT_DISABLED: 'api_client.disabled',
  WEBHOOK_CREATED: 'webhook.created',
  WEBHOOK_DISABLED: 'webhook.disabled',
} as const

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]
