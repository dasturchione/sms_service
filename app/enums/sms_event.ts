/**
 * Entries written to `sms_events`. Every state change of a message produces
 * one, so the table reads as a timeline when debugging a delivery.
 */
export const SmsEvent = {
  CREATED: 'created',
  QUEUED: 'queued',
  ASSIGNED: 'assigned',
  DISPATCHED: 'dispatched',
  ACKED: 'acked',
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  LEASE_EXPIRED: 'lease_expired',
  RETRY_SCHEDULED: 'retry_scheduled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  NO_GATEWAY: 'no_gateway',
} as const

export type SmsEvent = (typeof SmsEvent)[keyof typeof SmsEvent]
