/**
 * Every failure the platform reports uses a code from this list. Free form
 * strings are never stored, so error rates stay groupable and the retry
 * policy can classify a failure without parsing messages.
 */
export const ErrorCode = {
  // Request / authentication
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  CLIENT_DISABLED: 'CLIENT_DISABLED',

  // Message level, permanent
  INVALID_NUMBER: 'INVALID_NUMBER',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  BLOCKED_RECIPIENT: 'BLOCKED_RECIPIENT',
  MESSAGE_EXPIRED: 'MESSAGE_EXPIRED',
  BODY_UNAVAILABLE: 'BODY_UNAVAILABLE',
  CANCELLED_BY_CLIENT: 'CANCELLED_BY_CLIENT',
  ATTEMPTS_EXHAUSTED: 'ATTEMPTS_EXHAUSTED',

  // Routing
  NO_GATEWAY_AVAILABLE: 'NO_GATEWAY_AVAILABLE',
  GATEWAY_NOT_FOUND: 'GATEWAY_NOT_FOUND',
  OPERATOR_NOT_FOUND: 'OPERATOR_NOT_FOUND',

  // Device level, transient
  GATEWAY_OFFLINE: 'GATEWAY_OFFLINE',
  SIM_NOT_READY: 'SIM_NOT_READY',
  NO_SERVICE: 'NO_SERVICE',
  RADIO_OFF: 'RADIO_OFF',
  SEND_TIMEOUT: 'SEND_TIMEOUT',
  LEASE_EXPIRED: 'LEASE_EXPIRED',
  GENERIC_FAILURE: 'GENERIC_FAILURE',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // USSD
  USSD_UNSUPPORTED: 'USSD_UNSUPPORTED',
  USSD_FAILED: 'USSD_FAILED',
  USSD_PARSE_FAILED: 'USSD_PARSE_FAILED',

  // Infrastructure
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  QUEUE_UNAVAILABLE: 'QUEUE_UNAVAILABLE',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Failures that will produce the same result no matter how often we retry, so
 * a message hitting one of these fails immediately instead of burning
 * attempts and gateway capacity.
 */
export const PERMANENT_ERROR_CODES: readonly ErrorCode[] = [
  ErrorCode.INVALID_NUMBER,
  ErrorCode.MESSAGE_TOO_LONG,
  ErrorCode.BLOCKED_RECIPIENT,
  ErrorCode.MESSAGE_EXPIRED,
  ErrorCode.BODY_UNAVAILABLE,
  ErrorCode.CANCELLED_BY_CLIENT,
  ErrorCode.ATTEMPTS_EXHAUSTED,
]

export function isPermanentError(code: ErrorCode | string | null): boolean {
  if (!code) return false
  return PERMANENT_ERROR_CODES.includes(code as ErrorCode)
}
