import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { SmsStatus } from '#enums/sms_status'

export type ClaimOutcome =
  /** The number was already allowed on this SIM today; nothing consumed. */
  | 'existing'
  /** A new slot was taken out of this SIM's allowance. */
  | 'claimed'
  /** The SIM has no slot left for a new number. */
  | 'full'

/**
 * The daily allowance of distinct recipients per SIM.
 *
 * Operators cap how many different numbers a SIM may message per day, however
 * many messages each gets. This class is the only place that reads or writes
 * the ledger behind that cap, so the rules for consuming and returning a slot
 * live together.
 */
export default class RecipientAllowance {
  /**
   * Takes a slot for `recipient` on a SIM, or confirms it already holds one.
   *
   * Must run inside the dispatch transaction after `SimProfileSelector.reserve`
   * succeeded for this SIM. The reservation is a row-level UPDATE on
   * `sim_profiles`, so it holds that row's lock until commit, and that lock is
   * what makes "count, then insert" exact: no other dispatcher can be claiming
   * on the same SIM at the same time. Without it, two workers could both see
   * 59 and both add a new number.
   */
  static async claim(
    trx: TransactionClientContract,
    options: {
      simProfileId: number
      recipient: string
      usageDate: string
      limit: number | null
      messageId: number | bigint
    }
  ): Promise<ClaimOutcome> {
    const held = await trx
      .from('sim_daily_recipients')
      .where('sim_profile_id', options.simProfileId)
      .where('usage_date', options.usageDate)
      .where('recipient_normalized', options.recipient)
      .first()

    if (held) return 'existing'

    if (options.limit !== null) {
      const used = await this.countUsed(trx, options.simProfileId, options.usageDate)
      if (used >= options.limit) return 'full'
    }

    const now = new Date()
    await trx
      .table('sim_daily_recipients')
      .insert({
        sim_profile_id: options.simProfileId,
        usage_date: options.usageDate,
        recipient_normalized: options.recipient,
        first_message_id: String(options.messageId),
        messages_sent: 0,
        created_at: now,
        updated_at: now,
      })
      .onConflict(['sim_profile_id', 'usage_date', 'recipient_normalized'])
      .ignore()

    return 'claimed'
  }

  /**
   * Notes that a message for this number actually left the device. A slot
   * with at least one sent message is spent for the day and is never handed
   * back.
   */
  static async recordSent(
    trx: TransactionClientContract,
    simProfileId: number,
    recipient: string,
    usageDate: string
  ): Promise<void> {
    /**
     * An upsert, not an update. A result can arrive after its lease expired
     * and the slot was handed back; the message still went out, so the slot
     * is spent whether or not its row survived. Reality may put a SIM one
     * over its cap in that case, which is the truthful record of what the
     * operator saw.
     */
    await trx.rawQuery(
      `INSERT INTO sim_daily_recipients
         (sim_profile_id, usage_date, recipient_normalized, messages_sent, created_at, updated_at)
       VALUES (?, ?, ?, 1, now(), now())
       ON CONFLICT (sim_profile_id, usage_date, recipient_normalized)
       DO UPDATE SET messages_sent = sim_daily_recipients.messages_sent + 1,
                     updated_at = now()`,
      [simProfileId, usageDate, recipient]
    )
  }

  /**
   * Hands a slot back after an attempt that never reached the network.
   *
   * An operator counts the numbers it actually carried traffic to. A SIM whose
   * sends keep failing (no service, SIM not ready) would otherwise burn its
   * whole allowance on messages nobody received and go dark for the rest of
   * the day.
   *
   * The slot is kept if anything was sent to the number on this SIM today, or
   * if another message to it is still in flight there: releasing it then would
   * let a new number take the slot while the in-flight one still goes out.
   */
  static async release(
    trx: TransactionClientContract,
    options: {
      simProfileId: number
      recipient: string
      usageDate: string
      exceptMessageId: number | bigint
    }
  ): Promise<void> {
    await trx
      .from('sim_daily_recipients')
      .where('sim_profile_id', options.simProfileId)
      .where('usage_date', options.usageDate)
      .where('recipient_normalized', options.recipient)
      .where('messages_sent', 0)
      .whereNotExists((query) =>
        query
          .from('sms_messages')
          .where('sim_profile_id', options.simProfileId)
          .where('recipient_normalized', options.recipient)
          .whereIn('status', [SmsStatus.ASSIGNED, SmsStatus.SENDING])
          .whereNot('id', String(options.exceptMessageId))
      )
      .delete()
  }

  static async countUsed(
    client: TransactionClientContract | typeof db,
    simProfileId: number,
    usageDate: string
  ): Promise<number> {
    const row = await client
      .from('sim_daily_recipients')
      .where('sim_profile_id', simProfileId)
      .where('usage_date', usageDate)
      .count('* as total')
      .first()

    return Number(row?.total ?? 0)
  }

  /**
   * Today's usage for every SIM, with the cap that applies to it. Feeds the
   * admin overview and the metrics endpoint.
   */
  static async usageBySim(usageDate: string, defaultLimit: number) {
    const rows = await db
      .from('sim_profiles as sp')
      .join('gateways as g', 'g.id', 'sp.gateway_id')
      .leftJoin('operators as o', 'o.id', 'sp.operator_id')
      .select(
        'sp.id',
        'sp.uid',
        'sp.slot',
        'sp.label',
        'sp.phone_number',
        'sp.state',
        'sp.is_active',
        'g.uid as gateway_uid',
        'g.name as gateway_name',
        'g.status as gateway_status',
        'g.priority as gateway_priority',
        'g.id as gateway_id',
        'o.code as operator_code'
      )
      .select(this.effectiveLimitSql(defaultLimit))
      .select(
        db.raw(
          `(SELECT count(*) FROM sim_daily_recipients r
             WHERE r.sim_profile_id = sp.id AND r.usage_date = ?) AS recipients_used`,
          [usageDate]
        )
      )
      .select(
        db.raw(
          `(SELECT coalesce(sum(r.messages_sent), 0) FROM sim_daily_recipients r
             WHERE r.sim_profile_id = sp.id AND r.usage_date = ?) AS messages_sent`,
          [usageDate]
        )
      )
      /**
       * Fleet order, which is also the order the sequential strategy fills
       * SIMs in, so the screen reads top to bottom the way traffic flows.
       */
      .orderBy('g.priority', 'asc')
      .orderBy('g.id', 'asc')
      .orderBy('sp.slot', 'asc')

    return rows.map((row) => {
      const limit = row.recipient_limit === null ? null : Number(row.recipient_limit)
      const used = Number(row.recipients_used)

      return {
        simProfileId: Number(row.id),
        simUid: row.uid as string,
        slot: Number(row.slot),
        label: row.label as string | null,
        phoneNumber: row.phone_number as string | null,
        state: row.state as string,
        isActive: Boolean(row.is_active),
        gateway: {
          uid: row.gateway_uid as string,
          name: row.gateway_name as string | null,
          status: row.gateway_status as string,
        },
        operator: row.operator_code as string | null,
        limit,
        used,
        remaining: limit === null ? null : Math.max(0, limit - used),
        messagesSent: Number(row.messages_sent),
      }
    })
  }

  static async recipientsForSim(simProfileId: number, usageDate: string) {
    const rows = await db
      .from('sim_daily_recipients')
      .where('sim_profile_id', simProfileId)
      .where('usage_date', usageDate)
      .orderBy('created_at', 'asc')
      .select('recipient_normalized', 'messages_sent', 'created_at', 'updated_at')

    return rows.map((row) => ({
      recipient: row.recipient_normalized as string,
      messagesSent: Number(row.messages_sent),
      firstAt: DateTime.fromJSDate(new Date(row.created_at)).toISO(),
      lastAt: row.updated_at ? DateTime.fromJSDate(new Date(row.updated_at)).toISO() : null,
    }))
  }

  /**
   * Messages sent to each recipient today across every SIM. Answers "how many
   * has this number had" in the admin message list.
   */
  static async sentTodayByRecipient(
    recipients: string[],
    usageDate: string
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>()
    if (recipients.length === 0) return totals

    const rows = await db
      .from('sim_daily_recipients')
      .where('usage_date', usageDate)
      .whereIn('recipient_normalized', [...new Set(recipients)])
      .groupBy('recipient_normalized')
      .select('recipient_normalized')
      .sum('messages_sent as total')

    for (const row of rows) {
      totals.set(row.recipient_normalized, Number(row.total ?? 0))
    }

    return totals
  }

  /**
   * The cap for a SIM: its own override, else its operator's tariff, else the
   * conservative default for a SIM whose operator is unknown. An operator row
   * with an explicit null means the tariff has no cap.
   *
   * A tenant's own phone is the exception: its SIM and tariff are the
   * tenant's, which we know nothing about, so only a cap set on that SIM
   * applies. Expects `sp`, `g` and `o` in the query.
   */
  static effectiveLimitSql(defaultLimit: number) {
    return db.raw(
      `CASE
         WHEN g.assignment = 'tenant' THEN sp.daily_recipient_limit
         WHEN sp.daily_recipient_limit IS NOT NULL THEN sp.daily_recipient_limit
         WHEN o.id IS NOT NULL THEN o.daily_recipient_limit
         ELSE ?
       END AS recipient_limit`,
      [defaultLimit]
    )
  }
}
