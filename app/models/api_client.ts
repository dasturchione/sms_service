import { ApiClientSchema } from '#database/schema'
import { beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { type ClientAbility } from '#enums/ability'
import { generateUid } from '#utils/uid'
import Tenant from '#models/tenant'

export default class ApiClient extends ApiClientSchema {
  /**
   * Tokens live in their own table so revoking a client cascades to its
   * tokens, and a device credential can never authenticate as a client.
   */
  static accessTokens = DbAccessTokensProvider.forModel(ApiClient, {
    table: 'api_client_access_tokens',
    type: 'api_client_token',
    prefix: 'cat',
    expiresIn: '30 days',
  })

  declare currentAccessToken?: AccessToken

  @beforeCreate()
  static assignUid(client: ApiClient) {
    client.uid ||= generateUid('cli')
  }

  /**
   * node-postgres encodes a JS array as a Postgres array literal, which jsonb
   * rejects, so the value is serialized explicitly on the way in.
   */
  @column({ prepare: (value: ClientAbility[]) => JSON.stringify(value ?? []) })
  declare abilities: ClientAbility[]

  @belongsTo(() => Tenant)
  declare tenant: BelongsTo<typeof Tenant>

  get isUsable(): boolean {
    return this.isActive
  }
}
