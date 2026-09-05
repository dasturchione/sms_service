import { test } from '@japa/runner'
import { parseAmountToTiyin, parseUssdResponse } from '#services/ussd/ussd_parsers'

test.group('USSD amount parsing', () => {
  /**
   * The rule that matters: the last separator is a decimal point only when
   * exactly two digits follow it. Getting this wrong turns 12 500 so'm into
   * 12 so'm, and a SIM that reads as empty is a SIM the dispatcher parks.
   */
  test('reads thousands groups and decimals apart', ({ assert }) => {
    assert.equal(parseAmountToTiyin('12 500'), 1_250_000)
    assert.equal(parseAmountToTiyin('12.500'), 1_250_000)
    assert.equal(parseAmountToTiyin('12,50'), 1250)
    assert.equal(parseAmountToTiyin('1 234 567,89'), 123_456_789)
    assert.equal(parseAmountToTiyin('0'), 0)
  })

  test('keeps a negative balance negative', ({ assert }) => {
    assert.equal(parseAmountToTiyin('-3 200'), -320_000)
  })

  test('returns nothing for text with no number', ({ assert }) => {
    assert.isNull(parseAmountToTiyin('balans mavjud emas'))
  })
})

test.group('USSD response parsing', () => {
  test('reads a balance in either script', ({ assert }) => {
    assert.deepEqual(parseUssdResponse('beeline.balance', "Balans: 12 500,50 so'm"), {
      moneyBalance: 1_250_050,
      currency: 'UZS',
    })

    assert.deepEqual(parseUssdResponse('ucell.balance', 'Ваш баланс 7 300 сум'), {
      moneyBalance: 730_000,
      currency: 'UZS',
    })
  })

  /**
   * A reply that opens with an account number or a date must not have that
   * read as the balance.
   */
  test('prefers the amount next to the currency', ({ assert }) => {
    const parsed = parseUssdResponse('mobiuz.balance', "Hisob 4055: balans 9 900 so'm")

    assert.equal(parsed.moneyBalance, 990_000)
  })

  test('reads a remaining SMS count out of a mixed bundle reply', ({ assert }) => {
    assert.deepEqual(parseUssdResponse('beeline.sms_balance', '450 min, 12 GB, 300 SMS'), {
      smsBalance: 300,
    })

    assert.deepEqual(parseUssdResponse('ucell.sms_balance', 'Qoldiq SMS: 120 ta'), {
      smsBalance: 120,
    })
  })

  test('normalises the SIM own number', ({ assert }) => {
    assert.deepEqual(
      parseUssdResponse('generic.phone_number', 'Sizning raqamingiz: 998 90 123 45 67'),
      {
        phoneNumber: '+998901234567',
      }
    )

    assert.deepEqual(parseUssdResponse('generic.phone_number', 'Number +998(93)765-43-21'), {
      phoneNumber: '+998937654321',
    })
  })

  /**
   * An operator rewording its reply must cost a balance reading, not throw:
   * the raw text is stored either way and the failure is visible as one.
   */
  test('returns nothing rather than guessing', ({ assert }) => {
    assert.deepEqual(parseUssdResponse('beeline.sms_balance', 'Xizmat vaqtincha ishlamaydi'), {})
    assert.deepEqual(parseUssdResponse('unknown.parser', "Balans: 100 so'm"), {})
    assert.deepEqual(parseUssdResponse('beeline.balance', null), {})
  })
})
