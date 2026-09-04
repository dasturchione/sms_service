import { OperatorUssdCommandSchema } from '#database/schema'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Operator from '#models/operator'

export default class OperatorUssdCommand extends OperatorUssdCommandSchema {
  @column({ prepare: (value: string[]) => JSON.stringify(value ?? []) })
  declare steps: string[]

  @belongsTo(() => Operator)
  declare operator: BelongsTo<typeof Operator>
}
