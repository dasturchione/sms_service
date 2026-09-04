import { SmsAttemptSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import SmsMessage from '#models/sms_message'

export default class SmsAttempt extends SmsAttemptSchema {
  @belongsTo(() => SmsMessage)
  declare smsMessage: BelongsTo<typeof SmsMessage>

  @belongsTo(() => SimProfile)
  declare simProfile: BelongsTo<typeof SimProfile>

  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>
}
