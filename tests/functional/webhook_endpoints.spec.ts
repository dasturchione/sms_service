import { test } from '@japa/runner'
import { collectionOf, createTestClient, itemOf } from '#tests/helpers'
import { db } from '#tests/db'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { WebhookEvent } from '#enums/webhook_event'
import { JobQueueName } from '#enums/job'
import SmsService from '#services/sms/sms_service'
import WebhookService from '#services/webhooks/webhook_service'

const MANAGE = [ClientAbility.WEBHOOK_MANAGE, ClientAbility.SMS_SEND, ClientAbility.SMS_CANCEL]

test.group('webhook endpoints', () => {
  test('registers an endpoint and discloses the secret once', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: MANAGE })

    const created = await client
      .post('/api/v1/webhooks')
      .header('authorization', bearer)
      .json({ url: 'https://example.test/hooks', events: [WebhookEvent.SMS_DELIVERED] })

    created.assertStatus(201)
    assert.match((created.body() as { secret: string }).secret, /^whsec_[0-9a-f]{64}$/)

    const uid = itemOf(created).uid

    const read = await client.get(`/api/v1/webhooks/${uid}`).header('authorization', bearer)

    read.assertStatus(200)
    /**
     * The signing key must never come back on a read: an endpoint listing ends
     * up in logs and dashboards.
     */
    assert.isUndefined(itemOf(read).secret)
  })

  test('refuses a plaintext http endpoint', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: MANAGE })

    const response = await client
      .post('/api/v1/webhooks')
      .header('authorization', bearer)
      .json({ url: 'http://example.test/hooks' })

    response.assertStatus(422)
  })

  test('requires the webhook:manage ability', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client.get('/api/v1/webhooks').header('authorization', bearer)

    response.assertStatus(403)
    response.assertBodyContains({ error: { code: ErrorCode.FORBIDDEN } })
  })

  test('does not expose another tenant endpoint', async ({ client }) => {
    const owner = await createTestClient({ abilities: MANAGE })
    const stranger = await createTestClient({ abilities: MANAGE })

    const created = await client
      .post('/api/v1/webhooks')
      .header('authorization', owner.bearer)
      .json({ url: 'https://example.test/hooks' })

    const response = await client
      .get(`/api/v1/webhooks/${itemOf(created).uid}`)
      .header('authorization', stranger.bearer)

    response.assertStatus(404)
  })

  /**
   * Re-enabling is how an owner says "I fixed it", so the streak that switched
   * the endpoint off has to go with it.
   */
  test('clears the failure streak when an endpoint is re-enabled', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: MANAGE })

    const created = await client
      .post('/api/v1/webhooks')
      .header('authorization', bearer)
      .json({ url: 'https://example.test/hooks' })

    const uid = itemOf(created).uid

    await db()
      .from('webhook_endpoints')
      .where('uid', uid)
      .update({ is_active: false, failure_count: 20 })

    const response = await client
      .patch(`/api/v1/webhooks/${uid}`)
      .header('authorization', bearer)
      .json({ isActive: true })

    response.assertStatus(200)
    assert.equal(itemOf(response).failureCount, 0)
    assert.isTrue(itemOf(response).isActive)
  })

  test('deletes an endpoint', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: MANAGE })

    const created = await client
      .post('/api/v1/webhooks')
      .header('authorization', bearer)
      .json({ url: 'https://example.test/hooks' })

    await client
      .delete(`/api/v1/webhooks/${itemOf(created).uid}`)
      .header('authorization', bearer)
      .then((response) => response.assertStatus(204))

    const list = await client.get('/api/v1/webhooks').header('authorization', bearer)

    assert.lengthOf(collectionOf(list), 0)
  })
})

test.group('webhook fan out', () => {
  test('queues one delivery per subscribed endpoint', async ({ client, assert }) => {
    const { tenant, bearer } = await createTestClient({ abilities: MANAGE })

    /**
     * Two subscribers and one that asked for a different event, so the test
     * proves both the fan out and the filter.
     */
    for (const events of [[], [WebhookEvent.SMS_CANCELLED], [WebhookEvent.SMS_DELIVERED]]) {
      await client
        .post('/api/v1/webhooks')
        .header('authorization', bearer)
        .json({ url: `https://example.test/${events.join('-') || 'all'}`, events })
    }

    const { message } = await SmsService.send(tenant, null, {
      to: '901234567',
      message: 'Tasdiqlash kodi: 483921',
    })

    await SmsService.cancel(tenant, message.uid)

    const jobs = await db()
      .from('jobs')
      .where('queue', JobQueueName.WEBHOOK_DELIVERY)
      .select('payload')

    assert.lengthOf(jobs, 2)
    assert.deepEqual(
      jobs.map((job) => job.payload.event),
      [WebhookEvent.SMS_CANCELLED, WebhookEvent.SMS_CANCELLED]
    )
    assert.equal(jobs[0].payload.data.uid, message.uid)
  })

  /**
   * Device results are replayed on any flaky link, so the same event reaching
   * the publisher twice is the normal case, not an edge case.
   */
  test('does not queue the same event twice for one message', async ({ client, assert }) => {
    const { tenant, bearer } = await createTestClient({ abilities: MANAGE })

    await client
      .post('/api/v1/webhooks')
      .header('authorization', bearer)
      .json({ url: 'https://example.test/hooks' })

    const { message } = await SmsService.send(tenant, null, {
      to: '901234567',
      message: 'hi',
    })

    await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_SENT)
    await WebhookService.publishSmsEvent(message, WebhookEvent.SMS_SENT)

    const jobs = await db()
      .from('jobs')
      .where('queue', JobQueueName.WEBHOOK_DELIVERY)
      .count('* as total')
      .first()

    assert.equal(Number(jobs!.total), 1)
  })
})
