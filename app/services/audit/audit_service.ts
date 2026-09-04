import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import AuditLog from '#models/audit_log'
import { ActorType, type AuditAction } from '#enums/audit_action'

export type AuditActor = {
  type: ActorType
  id?: number | null
  label?: string | null
}

export type AuditEntry = {
  action: AuditAction
  actor: AuditActor
  tenantId?: number | null
  resourceType?: string
  resourceId?: string | number
  metadata?: Record<string, unknown>
  ctx?: HttpContext
}

/**
 * Writes the trail of who did what.
 *
 * Auditing must never be the reason a request fails, so a write error is
 * logged and swallowed. Losing an audit row is bad; refusing to send an SMS
 * because the audit table was momentarily unavailable is worse.
 */
export default class AuditService {
  static async record(entry: AuditEntry): Promise<void> {
    try {
      await AuditLog.create({
        tenantId: entry.tenantId ?? null,
        actorType: entry.actor.type,
        actorId: entry.actor.id ?? null,
        actorLabel: entry.actor.label ?? null,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId === undefined ? null : String(entry.resourceId),
        ipAddress: entry.ctx?.request.ip() ?? null,
        userAgent: entry.ctx?.request.header('user-agent')?.slice(0, 255) ?? null,
        metadata: entry.metadata ?? null,
        createdAt: DateTime.now(),
      })
    } catch (error) {
      logger.error({ err: error, action: entry.action }, 'failed to write audit log')
    }
  }

  static system(): AuditActor {
    return { type: ActorType.SYSTEM }
  }
}
