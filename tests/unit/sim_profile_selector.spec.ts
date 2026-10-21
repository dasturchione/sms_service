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
    availableNow: true,
    availableAt: null,
    holdsRecipient: false,
    recipientLimit: 60,
    recipientsUsed: 0,
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

/**
 * The daily cap of distinct recipients per SIM. These cover the decision only;
 * the functional suite covers the ledger and the atomic claim behind it.
 */
test.group('sim profile selector allowance plan', () => {
  const NOW = DateTime.fromISO('2026-10-19T10:00:00Z')

  function sim(id: number, overrides: Partial<RouteCandidate> = {}): RouteCandidate {
    return candidate({
      simProfileId: id,
      simProfileUid: `sim_${id}`,
      gatewayId: Math.ceil(id / 2),
      slot: (id - 1) % 2,
      ...overrides,
    })
  }

  function tried(plan: ReturnType<typeof SimProfileSelector.plan>): number[] {
    if (plan.kind !== 'try') throw new Error(`expected a try plan, got ${plan.kind}`)
    return plan.candidates.map((c) => c.simProfileId)
  }

  test('sequential fills the first SIM in fleet order before the next', ({ assert }) => {
    const plan = SimProfileSelector.plan(
      [sim(2, { recipientsUsed: 0 }), sim(1, { recipientsUsed: 10 })],
      RECIPIENT,
      'sequential',
      NOW
    )

    assert.deepEqual(tried(plan), [1])
  })

  /**
   * "Slot 1 full, so the next number goes to slot 2": a full SIM is skipped,
   * and only then does the next one in order take new numbers.
   */
  test('sequential moves to the next SIM once the first is full', ({ assert }) => {
    const plan = SimProfileSelector.plan(
      [sim(1, { recipientsUsed: 60, recipientLimit: 60 }), sim(2), sim(3)],
      RECIPIENT,
      'sequential',
      NOW
    )

    assert.deepEqual(tried(plan), [2])
  })

  /**
   * The crux of the sequential strategy. Falling through to slot 2 just because
   * slot 1 is paced for a few seconds would fill every SIM in parallel.
   */
  test('sequential waits for a busy SIM that still has room', ({ assert }) => {
    const freeAt = NOW.plus({ seconds: 40 })
    const plan = SimProfileSelector.plan(
      [sim(1, { availableNow: false, availableAt: freeAt }), sim(2)],
      RECIPIENT,
      'sequential',
      NOW
    )

    assert.equal(plan.kind, 'wait')
    if (plan.kind === 'wait') assert.equal(plan.until.toMillis(), freeAt.toMillis())
  })

  test('spread takes whichever SIM with room is free', ({ assert }) => {
    const plan = SimProfileSelector.plan(
      [sim(1, { availableNow: false, availableAt: NOW.plus({ seconds: 40 }) }), sim(2)],
      RECIPIENT,
      'spread',
      NOW
    )

    assert.deepEqual(tried(plan), [2])
  })

  /**
   * A number already allowed on a SIM costs nothing there. Sending it anywhere
   * else would spend a second slot on the same person.
   */
  test('a SIM already holding the number wins, even over fleet order', ({ assert }) => {
    for (const strategy of ['sequential', 'spread'] as const) {
      const plan = SimProfileSelector.plan(
        [sim(1), sim(2, { holdsRecipient: true })],
        RECIPIENT,
        strategy,
        NOW
      )

      assert.deepEqual(tried(plan), [2], strategy)
    }
  })

  test('a full SIM still takes numbers it already holds', ({ assert }) => {
    const plan = SimProfileSelector.plan(
      [sim(1, { recipientsUsed: 60, recipientLimit: 60, holdsRecipient: true })],
      RECIPIENT,
      'sequential',
      NOW
    )

    assert.deepEqual(tried(plan), [1])
  })

  test('the message waits for the SIM holding its number rather than spending another slot', ({
    assert,
  }) => {
    const plan = SimProfileSelector.plan(
      [
        sim(1, {
          holdsRecipient: true,
          availableNow: false,
          availableAt: NOW.plus({ seconds: 20 }),
        }),
        sim(2),
      ],
      RECIPIENT,
      'spread',
      NOW
    )

    assert.equal(plan.kind, 'wait')
  })

  test('every SIM full and none holding the number means exhausted', ({ assert }) => {
    const plan = SimProfileSelector.plan(
      [sim(1, { recipientsUsed: 60 }), sim(2, { recipientsUsed: 60 })],
      RECIPIENT,
      'sequential',
      NOW
    )

    assert.equal(plan.kind, 'exhausted')
  })

  test('no candidate at all is unavailable, not exhausted', ({ assert }) => {
    assert.equal(SimProfileSelector.plan([], RECIPIENT, 'sequential', NOW).kind, 'unavailable')
  })

  test('a SIM without a cap never fills up', ({ assert }) => {
    const plan = SimProfileSelector.plan(
      [sim(1, { recipientLimit: null, recipientsUsed: 5000 })],
      RECIPIENT,
      'sequential',
      NOW
    )

    assert.deepEqual(tried(plan), [1])
  })

  /**
   * A SIM busy because its in-flight slots are full has no known end, so the
   * wait falls back to a short retry rather than a guess.
   */
  test('waiting on a SIM with no known free time retries shortly', ({ assert }) => {
    const plan = SimProfileSelector.plan(
      [sim(1, { availableNow: false, availableAt: null })],
      RECIPIENT,
      'sequential',
      NOW
    )

    assert.equal(plan.kind, 'wait')
    if (plan.kind === 'wait') {
      const seconds = plan.until.diff(NOW, 'seconds').seconds
      assert.isAtLeast(seconds, 1)
      assert.isAtMost(seconds, 10)
    }
  })

  test('fleet order is priority, then device, then slot', ({ assert }) => {
    const ordered = [
      sim(4, { gatewayId: 2, slot: 1 }),
      sim(1, { gatewayId: 1, slot: 0, gatewayPriority: 200 }),
      sim(3, { gatewayId: 2, slot: 0 }),
    ].sort((a, b) => SimProfileSelector.compareFillOrder(a, b))

    assert.deepEqual(
      ordered.map((c) => c.simProfileId),
      [3, 4, 1]
    )
  })
})
