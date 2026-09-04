export const GatewayStatus = {
  /**
   * Registered by the device but not yet approved by an operator. A gateway
   * in this state has no token and cannot carry traffic.
   */
  PENDING_APPROVAL: 'pending_approval',
  OFFLINE: 'offline',
  ONLINE: 'online',
  /**
   * Connected but temporarily saturated, e.g. its rate limit bucket is empty.
   */
  BUSY: 'busy',
  /**
   * Switched off by an operator. Survives reconnects.
   */
  DISABLED: 'disabled',
  /**
   * Connected but unusable, e.g. no SIM, no service, permission revoked.
   */
  ERROR: 'error',
} as const

export type GatewayStatus = (typeof GatewayStatus)[keyof typeof GatewayStatus]

/**
 * Statuses the dispatcher will consider when picking a route.
 */
export const DISPATCHABLE_GATEWAY_STATUSES: readonly GatewayStatus[] = [GatewayStatus.ONLINE]

export const SimState = {
  UNKNOWN: 'unknown',
  READY: 'ready',
  ABSENT: 'absent',
  LOCKED: 'locked',
  NO_SERVICE: 'no_service',
} as const

export type SimState = (typeof SimState)[keyof typeof SimState]
