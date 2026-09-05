import type { HttpContext } from '@adonisjs/core/http'
import StaffService from '#services/admin/staff_service'
import AuditService from '#services/audit/audit_service'
import UserTransformer from '#transformers/user_transformer'
import { createStaffValidator, updateStaffValidator } from '#validators/admin'
import { ActorType, AuditAction } from '#enums/audit_action'

/**
 * Who may operate the platform.
 *
 * Accounts are created here rather than through self-signup, because signing
 * up is what a tenant's own users do; a staff account grants the ability to
 * issue credentials that spend money on the platform's SIMs, and that is
 * something an existing operator hands out deliberately.
 */
export default class AdminStaffController {
  async index({ serialize }: HttpContext) {
    const users = await StaffService.list()

    return serialize.withoutWrapping({
      data: users.map((user) => ({
        ...new UserTransformer(user).toObject(),
        role: user.role,
        isActive: user.isActive,
      })),
    })
  }

  async store({ auth, request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createStaffValidator)
    const actor = auth.use('api').getUserOrFail()

    const user = await StaffService.create(payload)

    await AuditService.record({
      action: AuditAction.TENANT_UPDATED,
      actor: { type: ActorType.USER, id: actor.id, label: actor.email },
      resourceType: 'user',
      resourceId: user.uid ?? user.email,
      metadata: { created: true, email: user.email, role: user.role },
      ctx: request.ctx,
    })

    response.status(201)

    return serialize(UserTransformer.transform(user))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const { isActive } = await request.validateUsing(updateStaffValidator)
    const actor = auth.use('api').getUserOrFail()

    const user = await StaffService.setActive(params.uid, isActive, actor.id)

    await AuditService.record({
      action: AuditAction.TENANT_UPDATED,
      actor: { type: ActorType.USER, id: actor.id, label: actor.email },
      resourceType: 'user',
      resourceId: user.uid ?? user.email,
      metadata: { isActive },
      ctx: request.ctx,
    })

    return serialize.withoutWrapping({
      data: { ...new UserTransformer(user).toObject(), role: user.role, isActive: user.isActive },
    })
  }
}
