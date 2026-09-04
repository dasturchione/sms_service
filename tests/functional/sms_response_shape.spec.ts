import { test } from '@japa/runner'
import { createTestClient, itemOf } from '#tests/helpers'
import { ClientAbility } from '#enums/ability'

/**
 * A tenant writes one parser for a message, not one per endpoint. If create
 * and read disagreed on which keys exist, that parser would break on whichever
 * shape it was not written against.
 */
test.group('message response shape', () => {
  test('create and read return the same keys', async ({ client, assert }) => {
    const { bearer } = await createTestClient({
      abilities: [ClientAbility.SMS_SEND, ClientAbility.SMS_READ],
    })

    const created = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'Kod: 483921' })

    const read = await client
      .get(`/api/v1/sms/${itemOf(created).uid}`)
      .header('authorization', bearer)

    assert.deepEqual(Object.keys(itemOf(created)).sort(), Object.keys(itemOf(read)).sort())
  })

  test('a message with no failure reports a null error rather than an empty object', async ({
    client,
    assert,
  }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'hello' })

    assert.isNull(itemOf(response).error)
    assert.isNull(itemOf(response).sentAt)
  })
})
