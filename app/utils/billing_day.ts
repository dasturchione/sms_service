import { DateTime } from 'luxon'
import gatewayConfig from '#config/gateway'

/**
 * The operator's calendar date for an instant, as `YYYY-MM-DD`.
 *
 * Every daily cap (distinct recipients, message quota) is counted per operator
 * day, and operators count in local time. Using the database's `current_date`
 * instead would follow the server's timezone, which is UTC here, and move the
 * reset to five in the morning in Tashkent.
 */
export function billingDate(at: DateTime = DateTime.now()): string {
  return at.setZone(gatewayConfig.routing.billingTimezone).toISODate()!
}
