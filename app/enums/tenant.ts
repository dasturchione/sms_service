export const TenantStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
} as const

export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus]

export const UserRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

/**
 * How much of a message body we are allowed to keep. Bodies routinely carry
 * one time codes, so the default is deliberately not `full`.
 */
export const BodyRetention = {
  FULL: 'full',
  MASKED: 'masked',
  NONE: 'none',
} as const

export type BodyRetention = (typeof BodyRetention)[keyof typeof BodyRetention]

export type TenantSettings = {
  storeBody?: BodyRetention
  defaultMaxAttempts?: number
  defaultExpiresInSeconds?: number
  lowBalanceThreshold?: number
}

export const DEFAULT_TENANT_SETTINGS: Required<TenantSettings> = {
  storeBody: BodyRetention.MASKED,
  defaultMaxAttempts: 3,
  defaultExpiresInSeconds: 0,
  lowBalanceThreshold: 500,
}
