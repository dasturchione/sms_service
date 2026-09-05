import { DateTime } from 'luxon'
import User from '#models/user'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { UserRole } from '#enums/tenant'

/**
 * The platform's own staff.
 *
 * A staff account is a user with no tenant — the absence is what makes someone
 * staff, so there is no flag here either. What this class adds over creating a
 * row is the two rules that make the list safe to edit from a web page: an
 * account cannot lock itself out, and disabling means the tokens die now.
 */
export default class StaffService {
  static async list(): Promise<User[]> {
    return User.query().whereNull('tenant_id').orderBy('id', 'asc')
  }

  static async findByUid(uid: string): Promise<User> {
    const user = await User.query().whereNull('tenant_id').where('uid', uid).first()
    if (!user) throw new NotFoundException('Operator', uid)

    return user
  }

  static async create(input: {
    email: string
    password: string
    fullName?: string | null
    role?: UserRole
  }): Promise<User> {
    const existing = await User.query().where('email', input.email).first()
    if (existing) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'That email is already in use', {
        status: 422,
      })
    }

    const user = await User.create({
      fullName: input.fullName ?? null,
      email: input.email,
      password: input.password,

      /**
       * Explicitly null: a staff account that picked up a tenant would become
       * a tenant administrator with the platform's own permissions.
       */
      tenantId: null,

      role: input.role ?? UserRole.ADMIN,
      isActive: true,
      createdAt: DateTime.now(),
    })

    await user.refresh()

    return user
  }

  /**
   * Enables or disables an account.
   *
   * `actingUserId` is not decoration: an operator disabling their own account
   * from the panel would be locked out of the thing they would need in order to
   * undo it, and on a small team there may be nobody else to ask.
   */
  static async setActive(uid: string, isActive: boolean, actingUserId: number): Promise<User> {
    const user = await this.findByUid(uid)

    if (user.id === actingUserId && !isActive) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'You cannot disable your own account', {
        status: 422,
      })
    }

    user.isActive = isActive
    await user.save()

    if (!isActive) {
      /**
       * Marking the account inactive alone would leave every issued token
       * working until it expired. The guard does check `isActive`, but a
       * revoked account should not be one check away from working again.
       */
      const tokens = await User.accessTokens.all(user)
      for (const token of tokens) {
        await User.accessTokens.delete(user, token.identifier)
      }
    }

    return user
  }
}
