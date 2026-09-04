import { GatewayEventSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Gateway from '#models/gateway'

export default class GatewayEvent extends GatewayEventSchema {
  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>
}
