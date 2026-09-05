import { test } from '@japa/runner'
import {
  REPLAY_TOLERANCE_SECONDS,
  signWebhook,
  verifyWebhook,
} from '#services/webhooks/webhook_signature'

const SECRET = 'whsec_0123456789abcdef'
const BODY = JSON.stringify({ event: 'sms.sent', data: { uid: 'sms_1' } })

test.group('webhook signature', () => {
  test('verifies a signature it produced', ({ assert }) => {
    const now = Math.floor(Date.now() / 1000)

    assert.isTrue(verifyWebhook(SECRET, BODY, signWebhook(SECRET, BODY, now), now))
  })

  test('rejects a body that was altered in flight', ({ assert }) => {
    const now = Math.floor(Date.now() / 1000)
    const header = signWebhook(SECRET, BODY, now)

    assert.isFalse(verifyWebhook(SECRET, `${BODY} `, header, now))
  })

  test('rejects a signature made with another secret', ({ assert }) => {
    const now = Math.floor(Date.now() / 1000)

    assert.isFalse(verifyWebhook(SECRET, BODY, signWebhook('whsec_other', BODY, now), now))
  })

  /**
   * The reason the timestamp is inside the signed string rather than beside
   * it: without this a captured delivery could be replayed forever.
   */
  test('rejects a delivery replayed outside the tolerance window', ({ assert }) => {
    const signedAt = Math.floor(Date.now() / 1000)
    const header = signWebhook(SECRET, BODY, signedAt)

    assert.isTrue(verifyWebhook(SECRET, BODY, header, signedAt + REPLAY_TOLERANCE_SECONDS - 5))
    assert.isFalse(verifyWebhook(SECRET, BODY, header, signedAt + REPLAY_TOLERANCE_SECONDS + 5))
  })

  test('rejects a malformed header', ({ assert }) => {
    assert.isFalse(verifyWebhook(SECRET, BODY, 'not-a-signature'))
    assert.isFalse(verifyWebhook(SECRET, BODY, 't=abc,v1=zz'))
  })
})
