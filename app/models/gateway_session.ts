import { GatewaySessionSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Gateway from '#models/gateway'

export default class GatewaySession extends GatewaySessionSchema {
  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>
}
