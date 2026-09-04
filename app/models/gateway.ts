import { GatewaySchema } from '#database/schema'
import { beforeCreate, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { GatewayStatus } from '#enums/gateway_status'
import { generateUid } from '#utils/uid'
import SimProfile from '#models/sim_profile'
import Tenant from '#models/tenant'

export default class Gateway extends GatewaySchema {
  static accessTokens = DbAccessTokensProvider.forModel(Gateway, {
    table: 'gateway_access_tokens',
    type: 'gateway_token',
    prefix: 'gwt',
  })

  declare currentAccessToken?: AccessToken

  @beforeCreate()
  static assignUid(gateway: Gateway) {
    gateway.uid ||= generateUid('gw')
  }

  @belongsTo(() => Tenant)
  declare tenant: BelongsTo<typeof Tenant>

  @hasMany(() => SimProfile)
  declare simProfiles: HasMany<typeof SimProfile>

  /**
   * A device only carries traffic once an operator has approved it and it is
   * currently holding a socket.
   */
  get isDispatchable(): boolean {
    return this.isActive && this.status === GatewayStatus.ONLINE
  }

  get isApproved(): boolean {
    return this.approvedAt !== null
  }

  /**
   * A shared pool device serves every tenant; a dedicated one serves exactly
   * the tenant it was assigned to.
   */
  servesTenant(tenantId: number): boolean {
    return this.tenantId === null || this.tenantId === tenantId
  }
}
