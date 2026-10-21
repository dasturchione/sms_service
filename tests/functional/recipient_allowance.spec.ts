import { test } from '@japa/runner'
import { createTestClient, collectionOf, itemOf } from '#tests/helpers'
import {
  addSimProfile,
  createApprovedGateway,
  createPlatformOperator,
  ensureOperator,
  FakeDevice,
  startGatewayServer,
  stopGatewayServer,
} from '#tests/gateway_helpers'
import { db } from '#tests/db'
import SmsDispatcher from '#services/sms/sms_dispatcher'
import SmsMessage from '#models/sms_message'
import SimProfile from '#models/sim_profile'
import Operator from '#models/operator'
import gatewayConfig from '#config/gateway'
import { billingDate } from '#utils/billing_day'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { SmsEvent } from '#enums/sms_event'
import { SmsStatus } from '#enums/sms_status'
import { ClientEvent, ServerEvent } from '#realtime/protocol'

/**
 * Operators sell tariffs that are unlimited in volume but capped in reach: a
 * SIM may message only so many different numbers per day. These tests pin down
 * how the fleet spends that allowance.
 */
test.group('recipient allowance', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()

    /**
     * Restored to whatever it was, so nothing here leaks into other suites.
     */
    const routing = gatewayConfig.routing as { fillStrategy: string }
    const original = routing.fillStrategy

    /**
     * Each test states the strategy it is about rather than inheriting
     * whatever `.env.test` says; the spread test switches it explicitly.
     */
    routing.fillStrategy = 'sequential'

    return async () => {
      routing.fillStrategy = original
      await stopGatewayServer(ws)
    }
  })

  /**
   * One dual SIM device. Pacing and in-flight limits are set out of the way so
   * the tests are about the allowance and nothing else.
   */
  async function dualSimDevice(limits: { first: number | null; second: number | null }) {
    const { gateway, simProfile, token } = await createApprovedGateway({
      smsPerMinute: 600,
      maxInFlight: 50,
      recipientLimit: limits.first,
    })
    const second = await addSimProfile(gateway, 1, {
      smsPerMinute: 600,
      recipientLimit: limits.second,
    })

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    return { gateway, first: simProfile, second, device }
  }

  async function send(client: any, bearer: string, to: string, message = 'Eslatma') {
    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to, message })

    return itemOf<{ uid: string }>(response).uid
  }

  /**
   * Lets time pass without sleeping: clears pacing and wake-up times between
   * passes, as if the next poll had come round. Anything still waiting after
   * that is waiting for a real reason.
   */
  async function drain(rounds = 6) {
    for (let index = 0; index < rounds; index++) {
      await db().from('sim_profiles').update({ next_available_at: null })
      await db()
        .from('sms_messages')
        .where('status', SmsStatus.QUEUED)
        .update({ next_attempt_at: null })
      await SmsDispatcher.dispatchBatch()
    }
  }

  async function simOf(uid: string): Promise<number | null> {
    const message = await SmsMessage.findBy('uid', uid)
    return message!.simProfileId
  }

  test('a SIM takes new numbers up to its limit, then the next slot does', async ({
    client,
    assert,
  }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { first, second, device } = await dualSimDevice({ first: 2, second: 2 })

    const a = await send(client, tenant.bearer, '901111111')
    const b = await send(client, tenant.bearer, '901111112')
    const c = await send(client, tenant.bearer, '901111113')

    await drain()
    await device.close()

    assert.equal(await simOf(a), first.id)
    assert.equal(await simOf(b), first.id)
    assert.equal(await simOf(c), second.id)
  })

  /**
   * "Slot 2 stays untouched until slot 1 is full", even though slot 2 was free
   * the whole time.
   */
  test('the second slot is not used while the first still has room', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { first, second, device } = await dualSimDevice({ first: 5, second: 5 })

    const uids = []
    for (const suffix of ['1', '2', '3']) {
      uids.push(await send(client, tenant.bearer, `90222222${suffix}`))
    }

    await drain()
    await device.close()

    for (const uid of uids) assert.equal(await simOf(uid), first.id)

    const onSecond = await db().from('sim_daily_recipients').where('sim_profile_id', second.id)
    assert.lengthOf(onSecond, 0)
  })

  test('a number already allowed goes back to its SIM even when that SIM is full', async ({
    client,
    assert,
  }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { first, device } = await dualSimDevice({ first: 2, second: 2 })

    await send(client, tenant.bearer, '903333331')
    await send(client, tenant.bearer, '903333332')
    await drain()

    const again = await send(client, tenant.bearer, '903333331', 'Ikkinchi eslatma')
    await drain()
    await device.close()

    assert.equal(await simOf(again), first.id)

    /**
     * And it took no new slot: still two numbers on the first SIM.
     */
    const rows = await db().from('sim_daily_recipients').where('sim_profile_id', first.id)
    assert.lengthOf(rows, 2)
  })

  /**
   * Every SIM has used its allowance and none of them knows this number: the
   * message must wait, not fail, and not spin.
   */
  test('when every slot is full the message waits with a clear reason', async ({
    client,
    assert,
  }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { device } = await dualSimDevice({ first: 1, second: 1 })

    await send(client, tenant.bearer, '904444441')
    await send(client, tenant.bearer, '904444442')
    const waiting = await send(client, tenant.bearer, '904444443')

    await drain(8)
    await device.close()

    const message = await SmsMessage.findBy('uid', waiting)
    assert.equal(message!.status, SmsStatus.QUEUED)
    assert.equal(message!.errorCode, ErrorCode.RECIPIENT_ALLOWANCE_EXHAUSTED)
    assert.equal(message!.attempts, 0)

    /**
     * Retried every few minutes, so a newly connected device is picked up
     * soon, without hammering the queue until midnight.
     */
    const waitSeconds = message!.nextAttemptAt!.diffNow('seconds').seconds
    assert.isAbove(waitSeconds, gatewayConfig.routing.allowanceExhaustedRetrySeconds - 30)

    /**
     * Eight passes, one timeline entry: the event marks a change of state, not
     * every look at the queue.
     */
    const events = await db()
      .from('sms_events')
      .where('sms_message_id', String(message!.id))
      .where('event', SmsEvent.ALLOWANCE_EXHAUSTED)
    assert.lengthOf(events, 1)
  })

  test('a new device picks up messages that were waiting for allowance', async ({
    client,
    assert,
  }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { device } = await dualSimDevice({ first: 1, second: 1 })

    await send(client, tenant.bearer, '905555551')
    await send(client, tenant.bearer, '905555552')
    const waiting = await send(client, tenant.bearer, '905555553')
    await drain()

    const extra = await createApprovedGateway({ smsPerMinute: 600, recipientLimit: 1 })
    const extraDevice = await FakeDevice.connect(extra.token)
    await extraDevice.waitFor(ServerEvent.SESSION_READY)

    await drain()
    await device.close()
    await extraDevice.close()

    const message = await SmsMessage.findBy('uid', waiting)
    assert.equal(message!.simProfileId, extra.simProfile.id)
    assert.isNull(message!.errorCode)
  })

  /**
   * The allowance belongs to the operator's day. A new day is a new list;
   * yesterday's numbers no longer count.
   */
  test('the next day starts with a fresh allowance', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { device } = await dualSimDevice({ first: 1, second: 1 })

    await send(client, tenant.bearer, '906666661')
    await send(client, tenant.bearer, '906666662')
    const waiting = await send(client, tenant.bearer, '906666663')
    await drain()

    assert.equal((await SmsMessage.findBy('uid', waiting))!.status, SmsStatus.QUEUED)

    /**
     * Move today's ledger to yesterday, which is what midnight does.
     */
    await db()
      .from('sim_daily_recipients')
      .update({ usage_date: db().raw(`usage_date - interval '1 day'`) })

    await drain()
    await device.close()

    const message = await SmsMessage.findBy('uid', waiting)
    assert.notEqual(message!.status, SmsStatus.QUEUED)
    assert.isNotNull(message!.simProfileId)
  })

  /**
   * A send that never reached the network must not spend the slot, or a SIM
   * with a flaky radio would burn its whole day on failures.
   */
  test('a failed send hands its slot back', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { gateway, simProfile, token } = await createApprovedGateway({
      smsPerMinute: 600,
      maxInFlight: 50,
      recipientLimit: 1,
    })
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const failing = await send(client, tenant.bearer, '907777771')
    await drain(1)
    await device.waitFor(ServerEvent.SMS_SEND)

    device.send(ClientEvent.SMS_RESULT, {
      jobId: failing,
      status: 'failed',
      errorCode: ErrorCode.NO_SERVICE,
      errorMessage: 'No service',
    })
    await device.waitFor(ServerEvent.RESULT_ACK)

    const held = await db().from('sim_daily_recipients').where('sim_profile_id', simProfile.id)
    assert.lengthOf(held, 0)

    /**
     * The slot is free again, so a different number gets through the same
     * SIM on the same day.
     */
    const next = await send(client, tenant.bearer, '907777772')
    await drain()
    await device.close()

    assert.equal(await simOf(next), simProfile.id)
    assert.isTrue(gateway.id > 0)
  })

  test('a slot that carried a message stays spent', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { simProfile, token } = await createApprovedGateway({
      smsPerMinute: 600,
      maxInFlight: 50,
      recipientLimit: 1,
    })
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const delivered = await send(client, tenant.bearer, '908888881')
    await drain(1)
    await device.waitFor(ServerEvent.SMS_SEND)
    device.send(ClientEvent.SMS_RESULT, { jobId: delivered, status: 'sent' })
    await device.waitFor(ServerEvent.RESULT_ACK)

    const failing = await send(client, tenant.bearer, '908888881', 'Ikkinchi')
    await drain(1)
    await device.waitFor(ServerEvent.SMS_SEND)
    device.send(ClientEvent.SMS_RESULT, {
      jobId: failing,
      status: 'failed',
      errorCode: ErrorCode.NO_SERVICE,
    })
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const row = await db()
      .from('sim_daily_recipients')
      .where('sim_profile_id', simProfile.id)
      .where('recipient_normalized', '+998908888881')
      .first()

    assert.isNotNull(row)
    assert.equal(row.messages_sent, 1)
  })

  test('the operator tariff applies when the SIM has no override', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const operator = await ensureOperator('beeline')
    await Operator.query().where('id', operator.id).update({ daily_recipient_limit: 1 })

    const { first, second, device } = await dualSimDevice({ first: null, second: null })

    const a = await send(client, tenant.bearer, '909999991')
    const b = await send(client, tenant.bearer, '909999992')
    await drain()
    await device.close()

    assert.equal(await simOf(a), first.id)
    assert.equal(await simOf(b), second.id)
  })

  test('a SIM override beats the operator tariff', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const operator = await ensureOperator('beeline')
    await Operator.query().where('id', operator.id).update({ daily_recipient_limit: 1 })

    const { first, device } = await dualSimDevice({ first: 3, second: null })

    const uids = [
      await send(client, tenant.bearer, '901212121'),
      await send(client, tenant.bearer, '901212122'),
      await send(client, tenant.bearer, '901212123'),
    ]
    await drain()
    await device.close()

    for (const uid of uids) assert.equal(await simOf(uid), first.id)
  })

  test('the spread strategy lets every slot take new numbers', async ({ client, assert }) => {
    ;(gatewayConfig.routing as { fillStrategy: string }).fillStrategy = 'spread'

    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { first, second, device } = await dualSimDevice({ first: 5, second: 5 })

    const a = await send(client, tenant.bearer, '901313131')
    const b = await send(client, tenant.bearer, '901313132')

    /**
     * One pass, no clearing of pacing: both go out at once, one per slot.
     */
    await SmsDispatcher.dispatchBatch()
    await device.close()

    assert.sameMembers([await simOf(a), await simOf(b)], [first.id, second.id])
  })

  test('the ledger is keyed by the billing day', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { first, device } = await dualSimDevice({ first: 5, second: 5 })

    await send(client, tenant.bearer, '901414141')
    await drain(1)
    await device.close()

    const row = await db().from('sim_daily_recipients').where('sim_profile_id', first.id).first()
    const stored = row.usage_date instanceof Date ? row.usage_date : new Date(row.usage_date)

    /**
     * Compared as calendar dates: the column is a `date`, and the driver hands
     * it back as local midnight.
     */
    const asText = `${stored.getFullYear()}-${String(stored.getMonth() + 1).padStart(2, '0')}-${String(stored.getDate()).padStart(2, '0')}`
    assert.equal(asText, billingDate())
  })
})

test.group('recipient allowance in the back office', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  /**
   * One device with one capped SIM that has sent to two numbers today.
   */
  async function busySim(client: any) {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const operator = await createPlatformOperator()
    const { gateway, simProfile, token } = await createApprovedGateway({
      smsPerMinute: 600,
      maxInFlight: 50,
      recipientLimit: 5,
    })
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const uids: string[] = []
    for (const to of ['901515151', '901515152', '901515151']) {
      const response = await client
        .post('/api/v1/sms')
        .header('authorization', tenant.bearer)
        .json({ to, message: 'Eslatma' })
      uids.push(itemOf<{ uid: string }>(response).uid)

      await db().from('sim_profiles').update({ next_available_at: null })
      await SmsDispatcher.dispatchBatch()
    }

    await device.close()
    return { operator, gateway, simProfile, uids }
  }

  test('shows each SIM with used and remaining allowance', async ({ client, assert }) => {
    const { operator, simProfile } = await busySim(client)

    const response = await client
      .get('/api/v1/admin/allowances')
      .header('authorization', operator.bearer)

    response.assertStatus(200)

    const row = collectionOf<{ simUid: string; used: number; limit: number; remaining: number }>(
      response
    ).find((entry) => entry.simUid === simProfile.uid)!

    assert.equal(row.used, 2)
    assert.equal(row.limit, 5)
    assert.equal(row.remaining, 3)
    assert.equal(response.body().meta.date, billingDate())
  })

  test('lists the numbers a SIM is serving today with their counts', async ({ client, assert }) => {
    const { operator, simProfile } = await busySim(client)

    const response = await client
      .get(`/api/v1/admin/allowances/${simProfile.uid}`)
      .header('authorization', operator.bearer)

    response.assertStatus(200)

    const recipients = itemOf<{ recipients: { recipient: string }[] }>(response).recipients
    assert.sameMembers(
      recipients.map((entry) => entry.recipient),
      ['+998901515151', '+998901515152']
    )
  })

  /**
   * "Who, how many, which device, which slot, from which number": the message
   * list answers it without opening every message.
   */
  test('the message list shows device, slot and SIM for each message', async ({
    client,
    assert,
  }) => {
    const { operator, gateway, simProfile } = await busySim(client)
    await SimProfile.query().where('id', simProfile.id).update({ phone_number: '+998901000001' })

    const response = await client
      .get('/api/v1/admin/messages')
      .header('authorization', operator.bearer)

    response.assertStatus(200)

    const rows = collectionOf<{
      recipient: string
      route: { gateway: { uid: string }; slot: number; sim: { uid: string; phoneNumber: string } }
    }>(response)

    assert.isAbove(rows.length, 0)
    for (const row of rows) {
      assert.equal(row.route.gateway.uid, gateway.uid)
      assert.equal(row.route.slot, 0)
      assert.equal(row.route.sim.uid, simProfile.uid)
      assert.equal(row.route.sim.phoneNumber, '+998901000001')
    }
  })

  test('the message list can be narrowed to one SIM slot', async ({ client, assert }) => {
    const { operator, simProfile } = await busySim(client)

    const response = await client
      .get('/api/v1/admin/messages')
      .qs({ sim: simProfile.uid })
      .header('authorization', operator.bearer)

    response.assertStatus(200)
    assert.lengthOf(collectionOf(response), 3)
  })

  test('the message detail names the SIM of every attempt', async ({ client, assert }) => {
    const { operator, simProfile, uids } = await busySim(client)

    const response = await client
      .get(`/api/v1/admin/messages/${uids[0]}`)
      .header('authorization', operator.bearer)

    response.assertStatus(200)

    const body = itemOf<{
      route: { sim: { uid: string } }
      attempts: { route: { sim: { uid: string } }; gatewayId?: number }[]
    }>(response)

    assert.equal(body.route.sim.uid, simProfile.uid)
    assert.equal(body.attempts[0].route.sim.uid, simProfile.uid)

    /**
     * Internal ids stay internal.
     */
    assert.notProperty(body.attempts[0], 'gatewayId')
  })

  test('an operator can set a SIM limit and an operator tariff', async ({ client, assert }) => {
    const operator = await createPlatformOperator()
    const { simProfile } = await createApprovedGateway()

    const sim = await client
      .patch(`/api/v1/admin/sims/${simProfile.uid}`)
      .header('authorization', operator.bearer)
      .json({ dailyRecipientLimit: 80 })

    sim.assertStatus(200)
    assert.equal((await SimProfile.find(simProfile.id))!.dailyRecipientLimit, 80)

    const tariff = await client
      .patch('/api/v1/admin/operators/beeline')
      .header('authorization', operator.bearer)
      .json({ dailyRecipientLimit: 100 })

    tariff.assertStatus(200)
    assert.equal(itemOf<{ dailyRecipientLimit: number }>(tariff).dailyRecipientLimit, 100)
  })

  test('the overview reports what is left of today and what is waiting', async ({
    client,
    assert,
  }) => {
    const { operator } = await busySim(client)

    const response = await client
      .get('/api/v1/admin/overview')
      .header('authorization', operator.bearer)

    response.assertStatus(200)

    const allowance = itemOf<{ allowance: { used: number; remaining: number; waiting: number } }>(
      response
    ).allowance

    assert.equal(allowance.used, 2)
    assert.equal(allowance.remaining, 3)
    assert.equal(allowance.waiting, 0)
  })
})
