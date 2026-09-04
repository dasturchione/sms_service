import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { UserRole } from '#enums/tenant'
import { generateUid } from '#utils/uid'
import Tenant from '#models/tenant'

/**
 * The hash service is only assigned once the application has booted, while this
 * module is imported before that. Passing `hash` directly would capture
 * `undefined` and make every user save fail inside the password hashing hook,
 * so the driver is resolved lazily instead.
 */
export default class User extends compose(
  UserSchema,
  withAuthFinder(() => hash.use())
) {
  static accessTokens = DbAccessTokensProvider.forModel(User)
  declare currentAccessToken?: AccessToken

  @beforeCreate()
  static assignUid(user: User) {
    user.uid ||= generateUid('usr')
  }

  @belongsTo(() => Tenant)
  declare tenant: BelongsTo<typeof Tenant>

  /**
   * A user without a tenant is a platform operator: they administer gateways
   * and approve devices across every tenant.
   */
  get isPlatformOperator(): boolean {
    return this.tenantId === null
  }

  get canAdminister(): boolean {
    return this.role === UserRole.OWNER || this.role === UserRole.ADMIN
  }

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
