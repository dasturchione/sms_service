import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import SimProfileSelector, { type RouteCandidate } from '#services/sms/sim_profile_selector'

function candidate(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    simProfileId: 1,
    simProfileUid: 'sim_1',
    slot: 0,
    gatewayId: 1,
    gatewayUid: 'gw_1',
    gatewayPriority: 100,
    maxInFlight: 1,
    inFlight: 0,
    operatorId: 1,
    operatorCode: 'beeline',
    phonePrefixes: [],
    smsPerMinute: 1,
    smsBalance: null,
    successRate: 1,
    lastUsedAt: null,
    ...overrides,
  }
}

const RECIPIENT = '+998901234567'

function pick(a: RouteCandidate, b: RouteCandidate): RouteCandidate {
  return [a, b].sort((x, y) => SimProfileSelector.compare(x, y, RECIPIENT))[0]
}

test.group('sim profile selector ordering', () => {
  /**
   * An operator setting a priority is stating a policy. It has to win over
   * every heuristic below it, or the setting would be advisory at best.
   */
  test('an explicit priority outranks every heuristic', ({ assert }) => {
    const preferred = candidate({ simProfileId: 1, gatewayPriority: 10, successRate: 0.2 })
    const healthier = candidate({ simProfileId: 2, gatewayPriority: 100, successRate: 1 })

    assert.equal(pick(preferred, healthier).simProfileId, 1)
  })

  test('on-net routing wins at equal priority', ({ assert }) => {
    const onNet = candidate({ simProfileId: 1, phonePrefixes: ['90', '91'] })
    const offNet = candidate({ simProfileId: 2, phonePrefixes: ['93'] })

    assert.equal(pick(onNet, offNet).simProfileId, 1)
  })

  /**
   * A phone with a failing radio should drain out of rotation without anyone
   * having to notice and disable it.
   */
  test('a failing device loses to a healthy one', ({ assert }) => {
    const failing = candidate({ simProfileId: 1, successRate: 0.3 })
    const healthy = candidate({ simProfileId: 2, successRate: 0.95 })

    assert.equal(pick(failing, healthy).simProfileId, 2)
  })

  test('load is spread across equally healthy devices', ({ assert }) => {
    const busy = candidate({ simProfileId: 1, inFlight: 1, maxInFlight: 2 })
    const idle = candidate({ simProfileId: 2, inFlight: 0, maxInFlight: 2 })

    assert.equal(pick(busy, idle).simProfileId, 2)
  })

  /**
   * An unknown balance must not be treated as an empty one, or every SIM whose
   * operator cannot be queried over USSD would sink to the bottom.
   */
  test('an unknown balance is not treated as empty', ({ assert }) => {
    const unknown = candidate({ simProfileId: 1, smsBalance: null })
    const low = candidate({ simProfileId: 2, smsBalance: 5 })

    assert.equal(pick(unknown, low).simProfileId, 1)
  })

  test('identical devices take turns', ({ assert }) => {
    const justUsed = candidate({ simProfileId: 1, lastUsedAt: DateTime.now() })
    const rested = candidate({ simProfileId: 2, lastUsedAt: DateTime.now().minus({ hours: 1 }) })

    assert.equal(pick(justUsed, rested).simProfileId, 2)
  })

  test('recognises numbers belonging to the SIM operator', ({ assert }) => {
    const beeline = candidate({ phonePrefixes: ['90', '91'] })

    assert.isTrue(SimProfileSelector.isOnNet(beeline, '+998901234567'))
    assert.isFalse(SimProfileSelector.isOnNet(beeline, '+998931234567'))
    assert.isFalse(SimProfileSelector.isOnNet(candidate({ phonePrefixes: [] }), '+998901234567'))
  })
})
