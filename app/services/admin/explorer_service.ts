import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import SmsMessage from '#models/sms_message'
import SmsEventLog from '#models/sms_event_log'
import SmsAttempt from '#models/sms_attempt'
import AuditLog from '#models/audit_log'
import Tenant from '#models/tenant'
import Gateway from '#models/gateway'
import { NotFoundException } from '#exceptions/domain_exception'
import { normalizePhoneNumber } from '#services/sms/phone_normalizer'
import type { SmsStatus } from '#enums/sms_status'

export type MessageFilters = {
  tenant?: string
  status?: SmsStatus
  recipient?: string
  reference?: string
  gateway?: string
  from?: DateTime
  to?: DateTime
  limit?: number
  cursor?: string
}

export type AuditFilters = {
  tenant?: string
  action?: string
  actorType?: string
  resourceId?: string
  limit?: number
  cursor?: string
}

/**
 * Read-only, platform-wide views over what tenants did.
 *
 * The tenant API deliberately cannot answer "show me every message on the
 * platform"; support work needs exactly that, so it lives here, behind the
 * staff guard, and stays read-only. An operator investigating an incident must
 * not be able to change what they are looking at.
 *
 * Paging is keyset, like the tenant API: ids are monotonic, so "everything
 * before this id" is stable while new rows arrive and cheap at any depth.
 */
export default class ExplorerService {
  static async messages(filters: MessageFilters) {
    const limit = filters.limit ?? 50
    const query = SmsMessage.query()
      .orderBy('id', 'desc')
      .limit(limit + 1)

    if (filters.tenant) {
      query.where('tenant_id', await this.tenantIdFor(filters.tenant))
    }

    if (filters.gateway) {
      const gateway = await Gateway.query().where('uid', filters.gateway).first()
      if (!gateway) throw new NotFoundException('Gateway', filters.gateway)

      /**
       * A message records the SIM it went out on, not the device, so the
       * device filter goes through that SIM.
       */
      query.whereIn(
        'sim_profile_id',
        db.from('sim_profiles').select('id').where('gateway_id', gateway.id)
      )
    }

    if (filters.status) query.where('status', filters.status)
    if (filters.reference) query.where('reference', filters.reference)

    if (filters.recipient) {
      /**
       * Normalised so `901234567`, `+998901234567` and `998 90 123 45 67` are
       * the same search — support gets the number in whatever shape the person
       * on the phone read it out.
       */
      query.where('recipient_normalized', normalizePhoneNumber(filters.recipient).e164)
    }

    if (filters.from) query.where('created_at', '>=', filters.from.toSQL()!)
    if (filters.to) query.where('created_at', '<=', filters.to.toSQL()!)
    if (filters.cursor) query.where('id', '<', filters.cursor)

    const rows = await query
    const hasMore = rows.length > limit
    const data = hasMore ? rows.slice(0, limit) : rows

    return {
      data,
      tenants: await this.tenantLabels(data.map((message) => message.tenantId)),
      nextCursor: hasMore ? String(data[data.length - 1].id) : null,
    }
  }

  /**
   * One message with its full timeline.
   *
   * The timeline is the reason this endpoint exists: "why did this code arrive
   * eleven minutes late" is answered by the events, not by the row.
   */
  static async message(uid: string) {
    const message = await SmsMessage.query().where('uid', uid).first()
    if (!message) throw new NotFoundException('Message', uid)

    const [events, attempts, tenant] = await Promise.all([
      SmsEventLog.query()
        .where('sms_message_id', String(message.id))
        .orderBy('id', 'asc')
        .limit(200),

      /**
       * Attempts say which device and SIM each try went through, which the
       * event timeline deliberately does not: an event is what happened, an
       * attempt is who it happened on.
       */
      SmsAttempt.query().where('sms_message_id', String(message.id)).orderBy('attempt_no', 'asc'),

      Tenant.find(message.tenantId),
    ])

    return { message, events, attempts, tenant }
  }

  static async audit(filters: AuditFilters) {
    const limit = filters.limit ?? 50
    const query = AuditLog.query()
      .orderBy('id', 'desc')
      .limit(limit + 1)

    if (filters.tenant) query.where('tenant_id', await this.tenantIdFor(filters.tenant))
    if (filters.action) query.where('action', filters.action)
    if (filters.actorType) query.where('actor_type', filters.actorType)
    if (filters.resourceId) query.where('resource_id', filters.resourceId)
    if (filters.cursor) query.where('id', '<', filters.cursor)

    const rows = await query
    const hasMore = rows.length > limit
    const data = hasMore ? rows.slice(0, limit) : rows

    return {
      data,
      nextCursor: hasMore ? String(data[data.length - 1].id) : null,
    }
  }

  private static async tenantIdFor(uid: string): Promise<number> {
    const tenant = await Tenant.query().where('uid', uid).first()
    if (!tenant) throw new NotFoundException('Tenant', uid)

    return tenant.id
  }

  /**
   * Tenant names for the rows on this page, in one query.
   *
   * A listing that showed internal tenant ids would be useless, and preloading
   * a relation per row would be a query per row.
   */
  private static async tenantLabels(ids: number[]): Promise<Record<number, string>> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return {}

    const tenants = await Tenant.query().whereIn('id', unique).select('id', 'uid', 'name')

    return Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.name]))
  }
}
