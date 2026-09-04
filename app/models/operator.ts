import { OperatorSchema } from '#database/schema'
import { column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import OperatorUssdCommand from '#models/operator_ussd_command'
import SimProfile from '#models/sim_profile'

export default class Operator extends OperatorSchema {
  @column({ prepare: (value: string[]) => JSON.stringify(value ?? []) })
  declare phonePrefixes: string[]

  @hasMany(() => OperatorUssdCommand)
  declare ussdCommands: HasMany<typeof OperatorUssdCommand>

  @hasMany(() => SimProfile)
  declare simProfiles: HasMany<typeof SimProfile>

  /**
   * Whether a national number belongs to this operator, used to prefer
   * on-net routing. Expects a normalized E.164 number.
   */
  ownsNumber(e164: string): boolean {
    const national = e164.replace(/^\+998/, '')
    return this.phonePrefixes.some((prefix) => national.startsWith(prefix))
  }
}
