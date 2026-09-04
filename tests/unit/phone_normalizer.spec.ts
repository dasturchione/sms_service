import { test } from '@japa/runner'
import { normalizePhoneNumber, tryNormalizePhoneNumber } from '#services/sms/phone_normalizer'
import DomainException from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'

test.group('phone normalizer', () => {
  /**
   * These four spellings reach us from real integrations for the same
   * subscriber. If they were stored as written, idempotency and per-recipient
   * limits would treat them as four different people.
   */
  test('every spelling of one number collapses to the same E.164 value', ({ assert }) => {
    const variants = ['+998901234567', '998901234567', '901234567', '+998 90 123 45 67']

    for (const variant of variants) {
      assert.equal(normalizePhoneNumber(variant).e164, '+998901234567')
    }
  })

  test('exposes the national part for operator prefix matching', ({ assert }) => {
    const result = normalizePhoneNumber('+998901234567')

    assert.equal(result.national, '901234567')
    assert.equal(result.country, 'UZ')
  })

  test('rejects a number that is not valid', ({ assert }) => {
    assert.throws(() => normalizePhoneNumber('12345'), DomainException)

    try {
      normalizePhoneNumber('12345')
    } catch (error) {
      assert.equal((error as DomainException).code, ErrorCode.INVALID_NUMBER)
      assert.equal((error as DomainException).status, 422)
    }
  })

  test('the non throwing variant returns null instead of raising', ({ assert }) => {
    assert.isNull(tryNormalizePhoneNumber('not a number'))
    assert.isNotNull(tryNormalizePhoneNumber('901234567'))
  })
})
