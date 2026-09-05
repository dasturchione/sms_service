/**
 * Events a tenant can subscribe to.
 *
 * Only terminal-ish transitions are published. A tenant does not need to hear
 * that a message was assigned to a device or that an attempt failed and will be
 * retried: those are the platform's business, and emitting them would turn a
 * single message into a stream of noise the receiver has to de-duplicate.
 */
export const WebhookEvent = {
  SMS_SENT: 'sms.sent',
  SMS_DELIVERED: 'sms.delivered',
  SMS_FAILED: 'sms.failed',
  SMS_EXPIRED: 'sms.expired',
  SMS_CANCELLED: 'sms.cancelled',

  /**
   * A device serving this tenant dropped off the network. Only useful to
   * tenants running dedicated gateways, which is why it is opt-in like the
   * rest.
   */
  GATEWAY_OFFLINE: 'gateway.offline',

  /**
   * A SIM's balance fell below the tenant's threshold. Landing here rather
   * than only in an operator alert is deliberate: the tenant is the one who
   * can top it up.
   */
  BALANCE_LOW: 'balance.low',
} as const

export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent]

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = Object.values(WebhookEvent)
