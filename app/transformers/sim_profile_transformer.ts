import type SimProfile from '#models/sim_profile'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class SimProfileTransformer extends BaseTransformer<SimProfile> {
  toObject() {
    const profile = this.resource

    return {
      uid: profile.uid,
      slot: profile.slot,
      label: profile.label,
      phoneNumber: profile.phoneNumber,
      state: profile.state,
      isActive: profile.isActive,
      smsPerMinute: profile.smsPerMinute,
      dailyQuota: profile.dailyQuota,
      sentToday: profile.sentToday,

      /**
       * Null means we have not been able to ask the operator, which is not the
       * same as zero and must not be rendered as an empty balance.
       */
      smsBalance: profile.smsBalance,
      balanceCheckedAt: profile.balanceCheckedAt,
    }
  }
}
