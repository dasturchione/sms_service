import type Tenant from '#models/tenant'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class TenantTransformer extends BaseTransformer<Tenant> {
  toObject() {
    const tenant = this.resource

    return {
      uid: tenant.uid,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,

      /**
       * Resolved rather than raw: the panel edits effective values, and a form
       * showing empty fields for everything the tenant never set would invite
       * an operator to "fix" defaults that were already correct.
       */
      settings: tenant.resolvedSettings,

      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    }
  }
}
