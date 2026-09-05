import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { createTestClient, itemOf } from '#tests/helpers'
import { db } from '#tests/db'
import SmsStatsService from '#services/reports/sms_stats_service'
import { ClientAbility } from '#enums/ability'
import { SmsStatus } from '#enums/sms_status'

const REPORT_ABILITIES = [ClientAbility.SMS_SEND, ClientAbility.REPORT_READ]

/**
 * Puts messages in the past, which the API deliberately cannot do: a report
 * about closed days is only meaningful if there are closed days.
 */
async function seedDay(tenantId: number, day: DateTime, rows: { status: string }[]) {
  let index = 0

  for (const row of rows) {
    index++
    await db()
      .table('sms_messages')
      .insert({
        uid: `sms_${day.toFormat('yyyyLLdd')}${String(index).padStart(14, '0')}`,
        tenant_id: tenantId,
        recipient: '901234567',
        recipient_normalized: '+998901234567',
        body_hash: 'hash',
        segments: 1,
        encoding: 'gsm7',
        status: row.status,
        priority: 5,
        attempts: 1,
        max_attempts: 3,
        queued_at: day.plus({ hours: 9 }).toSQL(),
        sent_at: row.status === SmsStatus.SENT ? day.plus({ hours: 9, seconds: 4 }).toSQL() : null,
        created_at: day.plus({ hours: 9 }).toSQL(),
        updated_at: day.plus({ hours: 9 }).toSQL(),
      })
  }
}

test.group('reports', () => {
  test('requires the report:read ability', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client.get('/api/v1/reports/daily').header('authorization', bearer)

    response.assertStatus(403)
  })

  /**
   * A message sent seconds ago has to appear immediately: a tenant seeing a
   * zero would conclude the platform lost it.
   */
  test('counts today live, without waiting for the rollup', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: REPORT_ABILITIES })

    await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'kod' })

    const response = await client.get('/api/v1/reports/daily').header('authorization', bearer)

    response.assertStatus(200)

    const rows = response.body().data as { date: string; total: number; pending: number }[]
    const today = rows.at(-1)!

    assert.equal(today.date, DateTime.now().toISODate())
    assert.equal(today.total, 1)
    assert.equal(today.pending, 1)
  })

  test('reads closed days from the rollup', async ({ client, assert }) => {
    const { tenant, bearer } = await createTestClient({ abilities: REPORT_ABILITIES })
    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')

    await seedDay(tenant.id, yesterday, [
      { status: SmsStatus.SENT },
      { status: SmsStatus.DELIVERED },
      { status: SmsStatus.FAILED },
    ])

    await SmsStatsService.rollup(yesterday)

    const response = await client.get('/api/v1/reports/daily').header('authorization', bearer)

    const rows = response.body().data as Record<string, any>[]
    const row = rows.find((entry) => entry.date === yesterday.toISODate())!

    assert.equal(row.total, 3)
    assert.equal(row.sent, 2)
    assert.equal(row.delivered, 1)
    assert.equal(row.failed, 1)
    assert.equal(row.avgSendMs, 4000)
  })

  /**
   * The rollup is a recompute, not an increment, so running it twice must not
   * double anything.
   */
  test('is safe to run the rollup twice', async ({ assert }) => {
    const { tenant } = await createTestClient()
    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')

    await seedDay(tenant.id, yesterday, [{ status: SmsStatus.SENT }, { status: SmsStatus.SENT }])

    await SmsStatsService.rollup(yesterday)
    await SmsStatsService.rollup(yesterday)

    const row = await db()
      .from('sms_daily_stats')
      .where('tenant_id', tenant.id)
      .where('date', yesterday.toISODate()!)
      .first()

    assert.equal(Number(row.total), 2)
  })

  test('summarises a range', async ({ client, assert }) => {
    const { tenant, bearer } = await createTestClient({ abilities: REPORT_ABILITIES })
    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')

    await seedDay(tenant.id, yesterday, [
      { status: SmsStatus.SENT },
      { status: SmsStatus.SENT },
      { status: SmsStatus.SENT },
      { status: SmsStatus.FAILED },
    ])

    await SmsStatsService.rollup(yesterday)

    const response = await client.get('/api/v1/reports/summary').header('authorization', bearer)

    response.assertStatus(200)

    const summary = itemOf(response)
    assert.equal(summary.total, 4)
    assert.equal(summary.sent, 3)
    assert.equal(summary.failed, 1)
    assert.equal(summary.successRate, 75)
  })

  test('does not report another tenant traffic', async ({ client, assert }) => {
    const owner = await createTestClient({ abilities: REPORT_ABILITIES })
    const stranger = await createTestClient({ abilities: REPORT_ABILITIES })

    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')
    await seedDay(owner.tenant.id, yesterday, [{ status: SmsStatus.SENT }])
    await SmsStatsService.rollup(yesterday)

    const response = await client
      .get('/api/v1/reports/summary')
      .header('authorization', stranger.bearer)

    assert.equal(itemOf(response).total, 0)
  })

  test('refuses a reversed range', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: REPORT_ABILITIES })

    const response = await client
      .get('/api/v1/reports/daily')
      .qs({ from: DateTime.now().toISODate(), to: DateTime.now().minus({ days: 5 }).toISODate() })
      .header('authorization', bearer)

    response.assertStatus(422)
  })
})
