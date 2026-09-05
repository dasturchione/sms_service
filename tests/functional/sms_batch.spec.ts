import { test } from '@japa/runner'
import { createTestClient } from '#tests/helpers'
import { db } from '#tests/db'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { SmsStatus } from '#enums/sms_status'

type BatchBody = {
  data: {
    index: number
    accepted: boolean
    duplicate: boolean
    message: { uid: string; status: string } | null
    error: { code: string } | null
  }[]
  meta: { accepted: number; rejected: number }
}

test.group('POST /api/v1/sms/batch', () => {
  test('accepts every valid entry', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/batch')
      .header('authorization', bearer)
      .json({
        messages: [
          { to: '901234567', message: 'Kod: 1' },
          { to: '901234568', message: 'Kod: 2', reference: 'campaign-7' },
        ],
      })

    response.assertStatus(202)

    const body = response.body() as BatchBody
    assert.equal(body.meta.accepted, 2)
    assert.equal(body.meta.rejected, 0)
    assert.equal(body.data[0].message!.status, SmsStatus.QUEUED)
  })

  /**
   * The whole point of a batch endpoint: one bad number must not cost the
   * caller the other entries.
   */
  test('rejects only the entries that are wrong', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/batch')
      .header('authorization', bearer)
      .json({
        messages: [
          { to: '901234567', message: 'yaxshi' },
          { to: '12345', message: 'yomon raqam' },
          { to: '901234569', message: 'yana yaxshi' },
        ],
      })

    response.assertStatus(202)

    const body = response.body() as BatchBody
    assert.equal(body.meta.accepted, 2)
    assert.equal(body.meta.rejected, 1)
    assert.equal(body.data[1].error!.code, ErrorCode.INVALID_NUMBER)
    assert.isNull(body.data[1].message)
  })

  /**
   * A retried batch must produce the same messages, not a second set of them.
   */
  test('is idempotent per entry when a key is supplied', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const payload = {
      messages: [
        { to: '901234567', message: 'Kod: 1' },
        { to: '901234568', message: 'Kod: 2' },
      ],
    }

    const first = await client
      .post('/api/v1/sms/batch')
      .header('authorization', bearer)
      .header('idempotency-key', 'batch-1')
      .json(payload)

    const second = await client
      .post('/api/v1/sms/batch')
      .header('authorization', bearer)
      .header('idempotency-key', 'batch-1')
      .json(payload)

    const firstBody = first.body() as BatchBody
    const secondBody = second.body() as BatchBody

    assert.isTrue(secondBody.data.every((entry) => entry.duplicate))
    assert.deepEqual(
      secondBody.data.map((entry) => entry.message!.uid),
      firstBody.data.map((entry) => entry.message!.uid)
    )

    const total = await db().from('sms_messages').count('* as total').first()
    assert.equal(Number(total!.total), 2)
  })

  test('refuses a batch larger than the limit', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms/batch')
      .header('authorization', bearer)
      .json({
        messages: Array.from({ length: 101 }, () => ({ to: '901234567', message: 'hi' })),
      })

    response.assertStatus(422)
  })
})

test.group('rate limiting', () => {
  test('refuses a send once the per minute allowance is spent', async ({ client, assert }) => {
    const { bearer, client: apiClient } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND],
    })

    await db().from('api_clients').where('id', apiClient.id).update({ rate_limit_per_min: 2 })

    for (let index = 0; index < 2; index++) {
      const allowed = await client
        .post('/api/v1/sms')
        .header('authorization', bearer)
        .json({ to: '901234567', message: `kod ${index}` })

      allowed.assertStatus(202)
    }

    const refused = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'uchinchi' })

    refused.assertStatus(429)
    refused.assertBodyContains({ error: { code: ErrorCode.RATE_LIMITED } })
    assert.isAbove(
      (refused.body() as unknown as { error: { details: { retryAfterSeconds: number } } }).error
        .details.retryAfterSeconds,
      0
    )
  })

  /**
   * Weighed as a whole before anything is written, so batching cannot be used
   * to step over the limit.
   */
  test('weighs a batch against the allowance as one', async ({ client, assert }) => {
    const { bearer, client: apiClient } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND],
    })

    await db().from('api_clients').where('id', apiClient.id).update({ rate_limit_per_min: 2 })

    const response = await client
      .post('/api/v1/sms/batch')
      .header('authorization', bearer)
      .json({
        messages: Array.from({ length: 3 }, (_, index) => ({
          to: '901234567',
          message: `kod ${index}`,
        })),
      })

    response.assertStatus(429)

    const total = await db().from('sms_messages').count('* as total').first()
    assert.equal(Number(total!.total), 0)
  })
})
