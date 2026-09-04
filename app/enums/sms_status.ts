/**
 * Lifecycle of a message.
 *
 * `sent` means the device handed the message to the network and is the
 * success state we guarantee. `delivered` depends on the operator returning a
 * delivery report, which not every network does, so it is a bonus rather than
 * a required step.
 */
export const SmsStatus = {
  CREATED: 'created',
  QUEUED: 'queued',
  ASSIGNED: 'assigned',
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const

export type SmsStatus = (typeof SmsStatus)[keyof typeof SmsStatus]

/**
 * States that will never change again. Any result arriving for a message in
 * one of these is ignored, which is what makes result handling idempotent.
 */
export const TERMINAL_SMS_STATUSES: readonly SmsStatus[] = [
  SmsStatus.DELIVERED,
  SmsStatus.FAILED,
  SmsStatus.CANCELLED,
  SmsStatus.EXPIRED,
]

/**
 * States a tenant is still allowed to cancel from.
 */
export const CANCELLABLE_SMS_STATUSES: readonly SmsStatus[] = [
  SmsStatus.CREATED,
  SmsStatus.QUEUED,
  SmsStatus.ASSIGNED,
]

export function isTerminalSmsStatus(status: SmsStatus): boolean {
  return TERMINAL_SMS_STATUSES.includes(status)
}

/**
 * Outcome of a single delivery attempt, stored on `sms_attempts`. Narrower
 * than SmsStatus because an attempt knows nothing about retries or expiry.
 */
export const SmsAttemptStatus = {
  ASSIGNED: 'assigned',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
} as const

export type SmsAttemptStatus = (typeof SmsAttemptStatus)[keyof typeof SmsAttemptStatus]

export const SmsPriority = {
  HIGH: 1,
  NORMAL: 5,
  LOW: 10,
} as const

export type SmsPriorityName = Lowercase<keyof typeof SmsPriority>
