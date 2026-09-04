import { test } from '@japa/runner'
import { decideRetry, noCapacityDelaySeconds } from '#services/sms/retry_policy'
import { ErrorCode } from '#enums/error_code'

test.group('retry policy', () => {
  /**
   * Retrying a number that does not exist costs three device slots and
   * produces the same answer three times.
   */
  test('permanent failures are not retried', ({ assert }) => {
    for (const code of [
      ErrorCode.INVALID_NUMBER,
      ErrorCode.MESSAGE_TOO_LONG,
      ErrorCode.BLOCKED_RECIPIENT,
    ]) {
      const decision = decideRetry({ errorCode: code, attempts: 1, maxAttempts: 3 })

      assert.isFalse(decision.retry)
      assert.equal(decision.retry === false ? decision.reason : null, 'permanent')
    }
  })

  test('transient failures are retried until the attempts run out', ({ assert }) => {
    const first = decideRetry({ errorCode: ErrorCode.SIM_NOT_READY, attempts: 1, maxAttempts: 3 })
    const last = decideRetry({ errorCode: ErrorCode.SIM_NOT_READY, attempts: 3, maxAttempts: 3 })

    assert.isTrue(first.retry)
    assert.isFalse(last.retry)
    assert.equal(last.retry === false ? last.reason : null, 'exhausted')
  })

  test('the wait grows with each attempt', ({ assert }) => {
    const first = decideRetry({ errorCode: ErrorCode.SEND_TIMEOUT, attempts: 1, maxAttempts: 5 })
    const third = decideRetry({ errorCode: ErrorCode.SEND_TIMEOUT, attempts: 3, maxAttempts: 5 })

    assert.isTrue(first.retry)
    assert.isTrue(third.retry)

    if (first.retry && third.retry) {
      assert.isBelow(first.delaySeconds, third.delaySeconds)
    }
  })

  /**
   * A gateway dropping fails a batch of messages at the same instant. Without
   * jitter they would all come back together and fail together again.
   */
  test('delays are jittered', ({ assert }) => {
    const delays = new Set(
      Array.from({ length: 40 }, () => {
        const decision = decideRetry({
          errorCode: ErrorCode.GATEWAY_OFFLINE,
          attempts: 2,
          maxAttempts: 3,
        })
        return decision.retry ? decision.delaySeconds : 0
      })
    )

    assert.isAbove(delays.size, 1)
  })

  test('a missing error code is treated as transient', ({ assert }) => {
    const decision = decideRetry({ errorCode: null, attempts: 1, maxAttempts: 3 })

    assert.isTrue(decision.retry)
  })

  test('waiting for capacity is a short wait', ({ assert }) => {
    for (let index = 0; index < 20; index++) {
      const delay = noCapacityDelaySeconds()
      assert.isAtLeast(delay, 1)
      assert.isAtMost(delay, 7)
    }
  })
})
