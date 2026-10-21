export const GatewayStatus = {
  /**
   * Kept for rows written before approval was removed. New devices never
   * enter this state.
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

/**
 * Whose traffic a device carries.
 *
 * Devices register and connect on their own, and start out unassigned:
 * connected, visible, but carrying nothing until someone decides what they
 * are for. That decision is this value, not a separate approval step.
 */
export const GatewayAssignment = {
  /** Waiting to be claimed by a tenant or put into the pool by an operator. */
  UNASSIGNED: 'unassigned',
  /** The platform's shared fleet, routed to automatically for every tenant. */
  POOL: 'pool',
  /**
   * A tenant's own phone. Used only for that tenant, and only when a message
   * names it; never for anyone else's traffic and never by automatic routing.
   */
  TENANT: 'tenant',
} as const

export type GatewayAssignment = (typeof GatewayAssignment)[keyof typeof GatewayAssignment]
