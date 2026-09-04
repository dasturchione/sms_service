import { test } from '@japa/runner'
import { createTestClient, itemOf } from '#tests/helpers'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { SmsStatus } from '#enums/sms_status'
import { BodyRetention, TenantStatus } from '#enums/tenant'

test.group('POST /api/v1/sms', () => {
  test('accepts a message and queues it', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'Tasdiqlash kodi: 483921' })

    response.assertStatus(202)
    response.assertBodyContains({
      data: { status: SmsStatus.QUEUED, recipient: '+998901234567', segments: 1 },
    })
    assert.match(itemOf(response).uid, /^sms_/)
  })

  test('rejects an unauthenticated request', async ({ client }) => {
    const response = await client.post('/api/v1/sms').json({ to: '901234567', message: 'hi' })

    response.assertStatus(401)
    response.assertBodyContains({ error: { code: ErrorCode.UNAUTHENTICATED } })
  })

  /**
   * A token that can read but not send must not be able to spend money.
   */
  test('rejects a token without the send ability', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_READ] })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'hi' })

    response.assertStatus(403)
    response.assertBodyContains({ error: { code: ErrorCode.FORBIDDEN } })
  })

  test('rejects an invalid recipient', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '12345', message: 'hi' })

    response.assertStatus(422)
    response.assertBodyContains({ error: { code: ErrorCode.INVALID_NUMBER } })
  })

  test('refuses to send for a suspended tenant', async ({ client }) => {
    const { bearer } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND],
      status: TenantStatus.SUSPENDED,
    })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'hi' })

    response.assertStatus(403)
    response.assertBodyContains({ error: { code: ErrorCode.TENANT_SUSPENDED } })
  })
})

test.group('POST /api/v1/sms idempotency', () => {
  /**
   * Retrying a request that timed out is the normal case for an HTTP client.
   * Without idempotency every such retry would be a second real, billable SMS.
   */
  test('replaying a key returns the original message instead of sending twice', async ({
    client,
    assert,
  }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const payload = { to: '901234567', message: 'Tasdiqlash kodi: 483921' }

    const first = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .header('idempotency-key', 'order-42')
      .json(payload)

    const second = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .header('idempotency-key', 'order-42')
      .json(payload)

    first.assertStatus(202)
    second.assertStatus(200)
    assert.equal(itemOf(second).uid, itemOf(first).uid)
  })

  /**
   * Reusing a key for a different message must fail loudly: returning the
   * original would silently drop a message the caller believes was sent.
   */
  test('reusing a key with a different payload is a conflict', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .header('idempotency-key', 'order-43')
      .json({ to: '901234567', message: 'first' })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .header('idempotency-key', 'order-43')
      .json({ to: '901234567', message: 'second' })

    response.assertStatus(409)
    response.assertBodyContains({ error: { code: ErrorCode.IDEMPOTENCY_CONFLICT } })
  })

  test('the same key is independent across tenants', async ({ client, assert }) => {
    const a = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const b = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const payload = { to: '901234567', message: 'hello' }

    const first = await client
      .post('/api/v1/sms')
      .header('authorization', a.bearer)
      .header('idempotency-key', 'shared')
      .json(payload)

    const second = await client
      .post('/api/v1/sms')
      .header('authorization', b.bearer)
      .header('idempotency-key', 'shared')
      .json(payload)

    first.assertStatus(202)
    second.assertStatus(202)
    assert.notEqual(itemOf(second).uid, itemOf(first).uid)
  })
})

test.group('message body retention', () => {
  test('digits are masked by default', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'Kod: 483921' })

    assert.equal(itemOf(response).message, 'Kod: ••••••')
  })

  test('a tenant can opt out of storing bodies entirely', async ({ client, assert }) => {
    const { bearer } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND],
      settings: { storeBody: BodyRetention.NONE },
    })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'Kod: 483921' })

    assert.isNull(itemOf(response).message)
  })

  test('a tenant can opt in to storing bodies in full', async ({ client, assert }) => {
    const { bearer } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND],
      settings: { storeBody: BodyRetention.FULL },
    })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'Kod: 483921' })

    assert.equal(itemOf(response).message, 'Kod: 483921')
  })
})
