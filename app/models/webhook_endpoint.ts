import { WebhookEndpointSchema } from '#database/schema'
import { beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { generateUid } from '#utils/uid'
import Tenant from '#models/tenant'

export default class WebhookEndpoint extends WebhookEndpointSchema {
  @beforeCreate()
  static assignUid(endpoint: WebhookEndpoint) {
    endpoint.uid ||= generateUid('whk')
  }

  @column({ prepare: (value: string[]) => JSON.stringify(value ?? []) })
  declare events: string[]

  @belongsTo(() => Tenant)
  declare tenant: BelongsTo<typeof Tenant>

  subscribesTo(event: string): boolean {
    return this.events.length === 0 || this.events.includes(event)
  }
}
