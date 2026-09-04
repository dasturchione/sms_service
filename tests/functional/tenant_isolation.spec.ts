import { test } from '@japa/runner'
import { createTestClient, collectionOf, itemOf } from '#tests/helpers'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { SmsStatus } from '#enums/sms_status'

/**
 * Isolation is the property the whole platform rests on: one leak between
 * tenants is a breach, not a bug. These tests exist so that any future query
 * that forgets its tenant scope fails here rather than in production.
 */
test.group('tenant isolation', () => {
  async function sendAs(client: any, bearer: string, message = 'hello') {
    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message })

    return itemOf<{ uid: string }>(response).uid
  }

  test('one tenant cannot read another tenant message', async ({ client }) => {
    const owner = await createTestClient({
      abilities: [ClientAbility.SMS_SEND, ClientAbility.SMS_READ],
    })
    const stranger = await createTestClient({
      abilities: [ClientAbility.SMS_SEND, ClientAbility.SMS_READ],
    })

    const uid = await sendAs(client, owner.bearer, 'secret')

    const own = await client.get(`/api/v1/sms/${uid}`).header('authorization', owner.bearer)
    own.assertStatus(200)

    const other = await client.get(`/api/v1/sms/${uid}`).header('authorization', stranger.bearer)

    /**
     * A 404 rather than a 403: telling a stranger that the id exists is
     * already a small leak.
     */
    other.assertStatus(404)
    other.assertBodyContains({ error: { code: ErrorCode.NOT_FOUND } })
  })

  test('listing only ever returns the caller own messages', async ({ client, assert }) => {
    const a = await createTestClient({
      abilities: [ClientAbility.SMS_SEND, ClientAbility.SMS_READ],
    })
    const b = await createTestClient({
      abilities: [ClientAbility.SMS_SEND, ClientAbility.SMS_READ],
    })

    const aUid = await sendAs(client, a.bearer, 'from a')
    const bUid = await sendAs(client, b.bearer, 'from b')

    const response = await client.get('/api/v1/sms').header('authorization', a.bearer)

    response.assertStatus(200)
    const uids = collectionOf<{ uid: string }>(response).map((row) => row.uid)
    assert.include(uids, aUid)
    assert.notInclude(uids, bUid)
  })

  test('one tenant cannot cancel another tenant message', async ({ client }) => {
    const owner = await createTestClient({
      abilities: [ClientAbility.SMS_SEND, ClientAbility.SMS_READ, ClientAbility.SMS_CANCEL],
    })
    const stranger = await createTestClient({
      abilities: [ClientAbility.SMS_SEND, ClientAbility.SMS_CANCEL],
    })

    const uid = await sendAs(client, owner.bearer)

    const attempt = await client
      .post(`/api/v1/sms/${uid}/cancel`)
      .header('authorization', stranger.bearer)

    attempt.assertStatus(404)

    /**
     * And the message is genuinely untouched, not merely reported as missing.
     */
    const check = await client.get(`/api/v1/sms/${uid}`).header('authorization', owner.bearer)
    check.assertBodyContains({ data: { status: SmsStatus.QUEUED } })
  })
})
