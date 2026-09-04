import { SmsMessageSchema } from '#database/schema'
import { beforeCreate, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { CANCELLABLE_SMS_STATUSES, isTerminalSmsStatus, SmsStatus } from '#enums/sms_status'
import { generateUid } from '#utils/uid'
import ApiClient from '#models/api_client'
import Gateway from '#models/gateway'
import Operator from '#models/operator'
import SimProfile from '#models/sim_profile'
import SmsAttempt from '#models/sms_attempt'
import SmsEventLog from '#models/sms_event_log'
import Tenant from '#models/tenant'

export default class SmsMessage extends SmsMessageSchema {
  @beforeCreate()
  static assignUid(message: SmsMessage) {
    message.uid ||= generateUid('sms')
  }

  @belongsTo(() => Tenant)
  declare tenant: BelongsTo<typeof Tenant>

  @belongsTo(() => ApiClient)
  declare apiClient: BelongsTo<typeof ApiClient>

  @belongsTo(() => SimProfile)
  declare simProfile: BelongsTo<typeof SimProfile>

  @belongsTo(() => Operator, { foreignKey: 'requestedOperatorId' })
  declare requestedOperator: BelongsTo<typeof Operator>

  @belongsTo(() => Gateway, { foreignKey: 'requestedGatewayId' })
  declare requestedGateway: BelongsTo<typeof Gateway>

  @hasMany(() => SmsAttempt)
  declare attempts_: HasMany<typeof SmsAttempt>

  @hasMany(() => SmsEventLog)
  declare events: HasMany<typeof SmsEventLog>

  get isTerminal(): boolean {
    return isTerminalSmsStatus(this.status)
  }

  get isCancellable(): boolean {
    return CANCELLABLE_SMS_STATUSES.includes(this.status)
  }

  /**
   * Whether another attempt is allowed. Checked before scheduling a retry so
   * an exhausted message fails once rather than looping through the queue.
   */
  get canRetry(): boolean {
    return !this.isTerminal && this.attempts < this.maxAttempts
  }

  /**
   * A message whose deadline passed must not be sent: a one time code that
   * arrives ten minutes late is worse than one that never arrives.
   */
  isExpiredAt(now: number = Date.now()): boolean {
    if (this.status === SmsStatus.EXPIRED) return true
    return this.expiresAt !== null && this.expiresAt.toMillis() <= now
  }
}
