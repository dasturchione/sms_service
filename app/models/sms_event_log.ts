import { SmsEventSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Gateway from '#models/gateway'
import SmsMessage from '#models/sms_message'

/**
 * Named `SmsEventLog` rather than `SmsEvent` so it does not collide with the
 * `SmsEvent` enum of event names that it stores.
 */
export default class SmsEventLog extends SmsEventSchema {
  static table = 'sms_events'

  @belongsTo(() => SmsMessage)
  declare smsMessage: BelongsTo<typeof SmsMessage>

  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>
}
