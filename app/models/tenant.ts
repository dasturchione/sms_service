import { TenantSchema } from '#database/schema'
import { beforeCreate, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DEFAULT_TENANT_SETTINGS, TenantStatus, type TenantSettings } from '#enums/tenant'
import { generateUid } from '#utils/uid'
import ApiClient from '#models/api_client'
import User from '#models/user'

export default class Tenant extends TenantSchema {
  @beforeCreate()
  static assignUid(tenant: Tenant) {
    tenant.uid ||= generateUid('ten')
  }

  @hasMany(() => ApiClient)
  declare apiClients: HasMany<typeof ApiClient>

  @hasMany(() => User)
  declare users: HasMany<typeof User>

  /**
   * Settings are stored sparsely so a new knob does not require touching every
   * existing row. Reads always go through here to get the defaults applied.
   */
  get resolvedSettings(): Required<TenantSettings> {
    return { ...DEFAULT_TENANT_SETTINGS, ...(this.settings ?? {}) }
  }

  get isUsable(): boolean {
    return this.status === TenantStatus.ACTIVE
  }
}
