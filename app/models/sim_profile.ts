import { SimProfileSchema } from '#database/schema'
import { beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SimState } from '#enums/gateway_status'
import { generateUid } from '#utils/uid'
import Gateway from '#models/gateway'
import Operator from '#models/operator'

/**
 * A routing endpoint: one SIM slot on one device. A dual SIM phone exposes
 * two of these, so the dispatcher never has to reason about slots itself.
 */
export default class SimProfile extends SimProfileSchema {
  @beforeCreate()
  static assignUid(profile: SimProfile) {
    profile.uid ||= generateUid('sim')
  }

  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>

  @belongsTo(() => Operator)
  declare operator: BelongsTo<typeof Operator>

  get isUsable(): boolean {
    return this.isActive && this.state === SimState.READY
  }

  /**
   * An unknown balance is not an empty balance. Treating it as empty would
   * park every SIM whose operator we cannot query over USSD.
   */
  get hasBalance(): boolean {
    return this.smsBalance === null || this.smsBalance > 0
  }

  get remainingDailyQuota(): number | null {
    if (this.dailyQuota === null) return null
    return Math.max(0, this.dailyQuota - this.sentToday)
  }
}
