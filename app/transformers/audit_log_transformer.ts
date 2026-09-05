import type AuditLog from '#models/audit_log'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class AuditLogTransformer extends BaseTransformer<AuditLog> {
  toObject() {
    const entry = this.resource

    return {
      action: entry.action,

      actor: {
        type: entry.actorType,
        label: entry.actorLabel,
      },

      resource:
        entry.resourceType === null ? null : { type: entry.resourceType, id: entry.resourceId },

      metadata: entry.metadata,

      /**
       * Kept because "who did this, and from where" is the question an audit
       * trail exists to answer.
       */
      ipAddress: entry.ipAddress,

      createdAt: entry.createdAt,
    }
  }
}
