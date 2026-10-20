import { GatewaySchema } from '#database/schema'
import { beforeCreate, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { GatewayAssignment, GatewayStatus } from '#enums/gateway_status'
import { generateUid } from '#utils/uid'
import { formatDeviceCode } from '#utils/device_code'
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
   * A device carries traffic only while it holds a socket, is in service, and
   * has been given something to do.
   */
  get isDispatchable(): boolean {
    return (
      this.isActive &&
      this.status === GatewayStatus.ONLINE &&
      this.assignment !== GatewayAssignment.UNASSIGNED
    )
  }

  get isPool(): boolean {
    return this.assignment === GatewayAssignment.POOL
  }

  /**
   * One tenant's own phone, belonging to `tenantId`.
   */
  isOwnedBy(tenantId: number): boolean {
    return this.assignment === GatewayAssignment.TENANT && this.tenantId === tenantId
  }

  /** The code as people read it: `K7Q2-M9XD`. */
  get displayCode(): string {
    return formatDeviceCode(this.code)
  }
}
