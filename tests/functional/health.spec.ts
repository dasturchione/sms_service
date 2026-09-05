import { test } from '@japa/runner'
import { createTestClient } from '#tests/helpers'
import { ClientAbility } from '#enums/ability'

test.group('operational endpoints', () => {
  test('answers liveness without authentication', async ({ client }) => {
    const response = await client.get('/health')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok' })
  })

  test('reports readiness with its checks', async ({ client }) => {
    const response = await client.get('/health/ready')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ready', checks: { database: 'ok' } })
  })

  test('exposes prometheus metrics', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'kod' })

    const response = await client.get('/metrics')

    response.assertStatus(200)

    const body = response.text()
    assert.include(body, '# TYPE sms_queue_depth gauge')
    assert.include(body, 'sms_queue_depth 1')
    assert.include(body, 'sms_messages_in_flight{status="queued"} 1')
    assert.include(body, 'sms_gateways_online 0')
  })
})
