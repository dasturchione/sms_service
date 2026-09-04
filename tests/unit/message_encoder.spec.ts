import { test } from '@japa/runner'
import { encodeMessage } from '#services/sms/message_encoder'

test.group('message encoder', () => {
  test('plain latin text stays in GSM-7', ({ assert }) => {
    const result = encodeMessage('Tasdiqlash kodi: 483921')

    assert.equal(result.encoding, 'gsm7')
    assert.equal(result.segments, 1)
    assert.equal(result.length, 23)
  })

  test('160 GSM-7 characters still fit one segment', ({ assert }) => {
    const result = encodeMessage('a'.repeat(160))

    assert.equal(result.segments, 1)
    assert.equal(result.remaining, 0)
  })

  /**
   * The first character past the single segment limit costs two segments, not
   * one, because concatenation headers eat into every part.
   */
  test('161 GSM-7 characters cost two segments', ({ assert }) => {
    const result = encodeMessage('a'.repeat(161))

    assert.equal(result.segments, 2)
  })

  test('extended GSM-7 characters count double', ({ assert }) => {
    const result = encodeMessage('€')

    assert.equal(result.encoding, 'gsm7')
    assert.equal(result.length, 2)
  })

  /**
   * A single Cyrillic or accented character forces the whole message to UCS-2,
   * which is why a tenant can see the segment count jump from 1 to 3 after an
   * apparently harmless edit.
   */
  test('non GSM-7 text falls back to UCS-2', ({ assert }) => {
    const result = encodeMessage('Тасдиқлаш коди')

    assert.equal(result.encoding, 'ucs2')
    assert.equal(result.segments, 1)
  })

  test('70 UCS-2 characters fit one segment, 71 do not', ({ assert }) => {
    assert.equal(encodeMessage('ы'.repeat(70)).segments, 1)
    assert.equal(encodeMessage('ы'.repeat(71)).segments, 2)
  })

  /**
   * Astral plane characters occupy two UTF-16 code units on the wire, so
   * counting them as one would undercount the bill.
   */
  test('emoji count as two UCS-2 units', ({ assert }) => {
    const result = encodeMessage('😀')

    assert.equal(result.encoding, 'ucs2')
    assert.equal(result.length, 2)
  })

  test('empty text is one empty segment', ({ assert }) => {
    const result = encodeMessage('')

    assert.equal(result.segments, 1)
    assert.equal(result.length, 0)
  })
})
