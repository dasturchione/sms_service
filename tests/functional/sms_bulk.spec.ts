import { test } from '@japa/runner'
import { createTestClient } from '#tests/helpers'
import { db } from '#tests/db'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { SmsStatus } from '#enums/sms_status'
import { SmsEvent } from '#enums/sms_event'
import { MAX_BULK_SIZE } from '#validators/sms'

type BulkBody = {
  data: {
    index: number
    to: string
    accepted: boolean
    duplicate: boolean
    message: { uid: string; status: string; recipient: string } | null
    error: { code: string; details: Record<string, unknown> } | null
  }[]
  meta: { requested: number; accepted: number; rejected: number }
}

/**
 * Distinct valid Uzbek mobile numbers, each with its own text.
 */
function entries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    to: `90${String(1000000 + index).slice(-7)}`,
    message: `Sizning do'koningizdan ${index * 1000} so'm qarzingiz bor`,
  }))
}

test.group('POST /api/v1/sms/bulk', () => {
  test('queues each entry with its own text', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json([
        { to: '+998921324567', message: "Sizning Test do'konidan 2000 so'm qarzingiz bor" },
        { to: '+998911234567', message: "Sizning Test2 do'konidan 50 000 so'm qarzingiz bor" },
      ])

    response.assertStatus(202)

    const body = response.body() as BulkBody
    assert.deepEqual(body.meta, { requested: 2, accepted: 2, rejected: 0 })
    assert.deepEqual(
      body.data.map((entry) => entry.to),
      ['+998921324567', '+998911234567']
    )
    assert.isTrue(body.data.every((entry) => entry.message!.status === SmsStatus.QUEUED))

    const rows = await db()
      .from('sms_messages')
      .select('recipient_normalized', 'dispatch_body')
      .orderBy('recipient_normalized')

    assert.deepEqual(rows, [
      {
        recipient_normalized: '+998911234567',
        dispatch_body: "Sizning Test2 do'konidan 50 000 so'm qarzingiz bor",
      },
      {
        recipient_normalized: '+998921324567',
        dispatch_body: "Sizning Test do'konidan 2000 so'm qarzingiz bor",
      },
    ])
  })

  /**
   * Same envelope as `/sms/batch`, so a caller can switch endpoints without
   * reshaping its payload.
   */
  test('also accepts the array under a messages key', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json({ messages: entries(2) })

    response.assertStatus(202)
    assert.equal((response.body() as BulkBody).meta.accepted, 2)
  })

  test('keeps per entry options', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json([
        { to: '901234567', message: 'a', reference: 'qarz-1', priority: 'high' },
        { to: '901234568', message: 'b', reference: 'qarz-2', priority: 'low' },
      ])

    const rows = await db()
      .from('sms_messages')
      .select('reference', 'priority')
      .orderBy('reference')

    assert.deepEqual(rows, [
      { reference: 'qarz-1', priority: 1 },
      { reference: 'qarz-2', priority: 10 },
    ])
  })

  /**
   * The timeline of a bulk message must look the same as one sent alone, or
   * the admin explorer would show bulk messages with a hole at the start.
   */
  test('writes the created and queued events for every message', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    await client.post('/api/v1/sms/bulk').header('authorization', bearer).json(entries(2))

    const events = await db().from('sms_events').select('event')
    assert.equal(events.filter((row) => row.event === SmsEvent.CREATED).length, 2)
    assert.equal(events.filter((row) => row.event === SmsEvent.QUEUED).length, 2)
  })

  /**
   * One bad entry must not cost the caller the rest of the list, whatever is
   * wrong with it.
   */
  test('rejects only the entries that are wrong', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json([
        { to: '901234567', message: 'yaxshi' },
        { to: '12345', message: 'yomon raqam' },
        { to: '901234568', message: 'Ж'.repeat(1500) },
        { to: '901234569', message: 'noma`lum operator', operator: 'yoq-operator' },
        { to: '901234570', message: 'yana yaxshi' },
      ])

    response.assertStatus(202)

    const body = response.body() as BulkBody
    assert.deepEqual(body.meta, { requested: 5, accepted: 2, rejected: 3 })
    assert.deepEqual(
      body.data.map((entry) => entry.error?.code ?? null),
      [
        null,
        ErrorCode.INVALID_NUMBER,
        ErrorCode.MESSAGE_TOO_LONG,
        ErrorCode.OPERATOR_NOT_FOUND,
        null,
      ]
    )

    const total = await db().from('sms_messages').count('* as total').first()
    assert.equal(Number(total!.total), 2)
  })

  /**
   * Two different reminders to one customer are legitimate. The same text to
   * the same number twice, however written, is a mistake that costs money.
   */
  test('drops only an exact repeat of number and text', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json([
        { to: '901234567', message: "Test do'koni: 2000 so'm" },
        { to: '+998 90 123 45 67', message: "Test do'koni: 2000 so'm" },
        { to: '901234567', message: "Test2 do'koni: 50 000 so'm" },
      ])

    const body = response.body() as BulkBody
    assert.equal(body.meta.accepted, 2)
    assert.equal(body.data[1].error!.code, ErrorCode.DUPLICATE_RECIPIENT)
    assert.equal(body.data[1].error!.details.firstIndex, 0)
    assert.isTrue(body.data[2].accepted)
  })

  test('is idempotent per entry when a key is supplied', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const payload = [...entries(2), { to: 'yomon', message: 'x' }]

    const first = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .header('idempotency-key', 'bulk-1')
      .json(payload)

    const second = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .header('idempotency-key', 'bulk-1')
      .json(payload)

    const firstBody = first.body() as BulkBody
    const secondBody = second.body() as BulkBody

    assert.isTrue(secondBody.data.slice(0, 2).every((entry) => entry.duplicate))
    assert.deepEqual(
      secondBody.data.slice(0, 2).map((entry) => entry.message!.uid),
      firstBody.data.slice(0, 2).map((entry) => entry.message!.uid)
    )

    const total = await db().from('sms_messages').count('* as total').first()
    assert.equal(Number(total!.total), 2)
  })

  /**
   * Reusing a key for a different text must not silently return the old
   * message: the caller would believe the new text went out.
   */
  test('reports a conflict when a key is reused with another text', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .header('idempotency-key', 'bulk-2')
      .json([{ to: '901234567', message: 'birinchi' }])

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .header('idempotency-key', 'bulk-2')
      .json([{ to: '901234567', message: 'ikkinchi' }])

    const body = response.body() as BulkBody
    assert.equal(body.data[0].error!.code, ErrorCode.IDEMPOTENCY_CONFLICT)
  })

  test(`accepts ${MAX_BULK_SIZE} entries in one request`, async ({ client, assert }) => {
    const { bearer, client: apiClient } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND],
    })

    await db()
      .from('api_clients')
      .where('id', apiClient.id)
      .update({ rate_limit_per_min: MAX_BULK_SIZE })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json(entries(MAX_BULK_SIZE))

    response.assertStatus(202)
    assert.equal((response.body() as BulkBody).meta.accepted, MAX_BULK_SIZE)

    const total = await db().from('sms_messages').count('* as total').first()
    assert.equal(Number(total!.total), MAX_BULK_SIZE)
  }).timeout(30_000)

  test('refuses more entries than the limit', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json(entries(MAX_BULK_SIZE + 1))

    response.assertStatus(422)
  })

  test('refuses an entry without a message', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json([{ to: '901234567' }])

    response.assertStatus(422)
  })

  test('is weighed against the rate limit as a whole', async ({ client, assert }) => {
    const { bearer, client: apiClient } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND],
    })

    await db().from('api_clients').where('id', apiClient.id).update({ rate_limit_per_min: 2 })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json(entries(3))

    response.assertStatus(429)

    const total = await db().from('sms_messages').count('* as total').first()
    assert.equal(Number(total!.total), 0)
  })

  test('requires the send ability', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_READ] })

    const response = await client
      .post('/api/v1/sms/bulk')
      .header('authorization', bearer)
      .json(entries(1))

    response.assertStatus(403)
  })
})
