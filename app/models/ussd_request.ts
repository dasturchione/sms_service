import { UssdRequestSchema } from '#database/schema'
import { beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { generateUid } from '#utils/uid'
import SimProfile from '#models/sim_profile'

export default class UssdRequest extends UssdRequestSchema {
  @beforeCreate()
  static assignUid(request: UssdRequest) {
    request.uid ||= generateUid('ussd')
  }

  @column({ prepare: (value: string[]) => JSON.stringify(value ?? []) })
  declare steps: string[]

  @belongsTo(() => SimProfile)
  declare simProfile: BelongsTo<typeof SimProfile>
}
