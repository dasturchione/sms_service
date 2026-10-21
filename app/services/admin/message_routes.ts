import db from '@adonisjs/lucid/services/db'
import type SmsMessage from '#models/sms_message'
import type SmsAttempt from '#models/sms_attempt'

/**
 * Which device, slot and SIM a message went through, in the terms an operator
 * actually uses. Internal ids never appear: support reads a device name and a
 * phone number, not a primary key.
 */
export type MessageRoute = {
  gateway: { uid: string; name: string | null }
  slot: number
  sim: { uid: string; phoneNumber: string | null; label: string | null }
  operator: string | null
}

/**
 * Resolves routes for a page of messages in two queries, however long the
 * page.
 */
export default class MessageRoutes {
  /**
   * The SIM a message is on, or last tried.
   *
   * `sim_profile_id` is cleared when a failed attempt is retried, so for those
   * the latest attempt is the only record of where it went. Without that
   * fallback, every failed message would show no route at all, which is
   * exactly when support most needs to see one.
   */
  static async forMessages(messages: SmsMessage[]): Promise<Map<string, MessageRoute>> {
    const simByMessage = new Map<string, number>()
    const missing: string[] = []

    for (const message of messages) {
      if (message.simProfileId !== null) {
        simByMessage.set(String(message.id), message.simProfileId)
      } else if (message.attempts > 0) {
        missing.push(String(message.id))
      }
    }

    if (missing.length > 0) {
      const latest = await db
        .from('sms_attempts')
        .distinctOn('sms_message_id')
        .select('sms_message_id', 'sim_profile_id')
        .whereIn('sms_message_id', missing)
        .whereNotNull('sim_profile_id')
        .orderBy('sms_message_id')
        .orderBy('attempt_no', 'desc')

      for (const row of latest) {
        simByMessage.set(String(row.sms_message_id), Number(row.sim_profile_id))
      }
    }

    const routes = await this.forSims([...new Set(simByMessage.values())])
    const result = new Map<string, MessageRoute>()

    for (const [messageId, simId] of simByMessage) {
      const route = routes.get(simId)
      if (route) result.set(messageId, route)
    }

    return result
  }

  static async forAttempts(attempts: SmsAttempt[]): Promise<Map<number, MessageRoute>> {
    const ids = attempts
      .map((attempt) => attempt.simProfileId)
      .filter((id): id is number => id !== null)

    return this.forSims([...new Set(ids)])
  }

  static async forSims(simIds: number[]): Promise<Map<number, MessageRoute>> {
    const routes = new Map<number, MessageRoute>()
    if (simIds.length === 0) return routes

    const rows = await db
      .from('sim_profiles as sp')
      .join('gateways as g', 'g.id', 'sp.gateway_id')
      .leftJoin('operators as o', 'o.id', 'sp.operator_id')
      .whereIn('sp.id', simIds)
      .select(
        'sp.id',
        'sp.uid',
        'sp.slot',
        'sp.label',
        'sp.phone_number',
        'g.uid as gateway_uid',
        'g.name as gateway_name',
        'o.code as operator_code'
      )

    for (const row of rows) {
      routes.set(Number(row.id), {
        gateway: { uid: row.gateway_uid, name: row.gateway_name },
        slot: Number(row.slot),
        sim: { uid: row.uid, phoneNumber: row.phone_number, label: row.label },
        operator: row.operator_code ?? null,
      })
    }

    return routes
  }
}
