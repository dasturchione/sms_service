import { test } from '@japa/runner'
import { randomBytes } from 'node:crypto'
import { createTestClient, collectionOf, itemOf } from '#tests/helpers'
import {
  createApprovedGateway,
  FakeDevice,
  startGatewayServer,
  stopGatewayServer,
} from '#tests/gateway_helpers'
import { db } from '#tests/db'
import GatewayService from '#services/gateway/gateway_service'
import SmsDispatcher from '#services/sms/sms_dispatcher'
import SmsMessage from '#models/sms_message'
import SimProfile from '#models/sim_profile'
import Operator from '#models/operator'
import { ensureOperator } from '#tests/gateway_helpers'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { GatewayAssignment, SimState } from '#enums/gateway_status'
import { SmsStatus } from '#enums/sms_status'
import { ClientEvent, ServerEvent } from '#realtime/protocol'

const ALL = [
  ClientAbility.SMS_SEND,
  ClientAbility.SMS_READ,
  ClientAbility.DEVICE_READ,
  ClientAbility.DEVICE_MANAGE,
]

/**
 * A tenant installs the app on its own phone, claims it by the code on the
 * screen, and sends through it. The phone never carries anyone else's traffic
 * and is never used unless a message names it.
 */
test.group('own devices', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  /**
   * A freshly installed phone: registered, connected, one ready SIM, and
   * waiting to be claimed.
   */
  async function freshPhone(slots = [0]) {
    const { gateway, token } = await GatewayService.register({
      deviceId: `dev-${randomBytes(8).toString('hex')}`,
      deviceName: 'Own Phone',
      model: 'A15',
    })

    const operator = await ensureOperator('beeline')
    for (const slot of slots) {
      await SimProfile.create({
        gatewayId: gateway.id,
        slot,
        operatorId: operator.id,
        state: SimState.READY,
        isActive: true,
        smsPerMinute: 600,
      })
    }

    gateway.maxInFlight = 10
    await gateway.save()

    const device = await FakeDevice.connect(token!)
    await device.waitFor(ServerEvent.SESSION_READY)

    return { gateway, device, code: gateway.displayCode }
  }

  async function claim(client: any, bearer: string, code: string, name?: string) {
    return client
      .post('/api/v1/devices/claim')
      .header('authorization', bearer)
      .json({ code, ...(name ? { name } : {}) })
  }

  async function send(client: any, bearer: string, body: Record<string, unknown>) {
    return client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: 'Salom', ...body })
  }

  test('a tenant claims a phone by its code and the phone is told', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()

    const response = await claim(client, tenant.bearer, code, 'Filial 1')
    response.assertStatus(201)
    assert.equal(itemOf<{ name: string }>(response).name, 'Filial 1')

    const update = await device.waitFor(ServerEvent.CONFIG_UPDATE)
    await device.close()

    const data = update.data as { assignment: string; tenantName: string }
    assert.equal(data.assignment, GatewayAssignment.TENANT)
    assert.equal(data.tenantName, tenant.tenant.name)
  })

  test('the code is accepted however it is typed', async ({ client }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()

    const sloppy = code.replace('-', ' ').toLowerCase()
    const response = await claim(client, tenant.bearer, sloppy)
    await device.close()

    response.assertStatus(201)
  })

  test('claiming twice is harmless', async ({ client }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()

    await claim(client, tenant.bearer, code)
    const again = await claim(client, tenant.bearer, code)
    await device.close()

    again.assertStatus(200)
  })

  /**
   * Once claimed, the phone is locked: another tenant who saw the QR cannot
   * take it.
   */
  test('a claimed phone cannot be taken by another tenant', async ({ client, assert }) => {
    const owner = await createTestClient({ abilities: ALL })
    const stranger = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()

    await claim(client, owner.bearer, code)
    const response = await claim(client, stranger.bearer, code)
    await device.close()

    response.assertStatus(409)
    assert.equal(response.body().error.code, ErrorCode.DEVICE_ALREADY_CLAIMED)
  })

  test('a pool device cannot be claimed', async ({ client }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { gateway } = await createApprovedGateway()

    const response = await claim(client, tenant.bearer, gateway.displayCode)
    response.assertStatus(409)
  })

  test('a message naming the phone goes out through it', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { gateway, device, code } = await freshPhone()
    await claim(client, tenant.bearer, code)

    const response = await send(client, tenant.bearer, { device: code })
    response.assertStatus(202)

    await SmsDispatcher.dispatchBatch()
    const job = await device.waitFor(ServerEvent.SMS_SEND)
    await device.close()

    const uid = itemOf<{ uid: string }>(response).uid
    assert.equal((job.data as { jobId: string }).jobId, uid)

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.requestedGatewayId, gateway.id)
  })

  test('a chosen slot is honoured', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone([0, 1])
    await claim(client, tenant.bearer, code)

    await send(client, tenant.bearer, { device: code, slot: 1 })
    await SmsDispatcher.dispatchBatch()

    const job = await device.waitFor(ServerEvent.SMS_SEND)
    await device.close()

    assert.equal((job.data as { simSlot: number }).simSlot, 1)
  })

  test('a slot the phone does not have is refused up front', async ({ client }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone([0])
    await claim(client, tenant.bearer, code)

    const response = await send(client, tenant.bearer, { device: code, slot: 1 })
    await device.close()

    response.assertStatus(422)
  })

  test('a slot without a device is refused', async ({ client }) => {
    const tenant = await createTestClient({ abilities: ALL })

    const response = await send(client, tenant.bearer, { slot: 0 })
    response.assertStatus(422)
  })

  /**
   * Another tenant's code looks exactly like an unknown one, so codes cannot
   * be probed, and nobody can send through somebody else's phone.
   */
  test('nobody else can send through the phone', async ({ client, assert }) => {
    const owner = await createTestClient({ abilities: ALL })
    const stranger = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()
    await claim(client, owner.bearer, code)

    const response = await send(client, stranger.bearer, { device: code })
    await device.close()

    response.assertStatus(422)
    assert.equal(response.body().error.code, ErrorCode.GATEWAY_NOT_FOUND)
  })

  /**
   * Without a device the shared pool is used; the tenant's own phone is never
   * picked automatically, not even for its own tenant.
   */
  test('automatic routing never uses a tenant phone', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()
    await claim(client, tenant.bearer, code)

    const response = await send(client, tenant.bearer, {})
    await SmsDispatcher.dispatchBatch()
    await device.close()

    const message = await SmsMessage.findBy('uid', itemOf<{ uid: string }>(response).uid)
    assert.equal(message!.status, SmsStatus.QUEUED)
    assert.equal(message!.errorCode, ErrorCode.NO_GATEWAY_AVAILABLE)
  })

  test('an unassigned phone carries nothing', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device } = await freshPhone()

    const response = await send(client, tenant.bearer, {})
    await SmsDispatcher.dispatchBatch()
    await device.close()

    const message = await SmsMessage.findBy('uid', itemOf<{ uid: string }>(response).uid)
    assert.equal(message!.status, SmsStatus.QUEUED)
  })

  /**
   * The operator's daily cap protects the platform's SIMs. A tenant's own SIM
   * is the tenant's business unless a cap is set on that SIM.
   */
  test('the operator cap does not apply to a tenant phone', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const operator = await ensureOperator('beeline')
    await Operator.query().where('id', operator.id).update({ daily_recipient_limit: 1 })

    const { device, code } = await freshPhone()
    await claim(client, tenant.bearer, code)

    const uids: string[] = []
    for (const to of ['901111111', '901111112', '901111113']) {
      const response = await send(client, tenant.bearer, { device: code, to })
      uids.push(itemOf<{ uid: string }>(response).uid)
      await db().from('sim_profiles').update({ next_available_at: null })
      await SmsDispatcher.dispatchBatch()
    }
    await device.close()

    for (const uid of uids) {
      const message = await SmsMessage.findBy('uid', uid)
      assert.equal(message!.status, SmsStatus.ASSIGNED, uid)
    }
  })

  test('an offline phone keeps its messages waiting with a clear reason', async ({
    client,
    assert,
  }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()
    await claim(client, tenant.bearer, code)
    await device.close()
    await stopGatewayServer(ws)
    ws = await startGatewayServer()

    const other = await createApprovedGateway()
    const otherDevice = await FakeDevice.connect(other.token)
    await otherDevice.waitFor(ServerEvent.SESSION_READY)

    const response = await send(client, tenant.bearer, { device: code })
    await SmsDispatcher.dispatchBatch()
    await otherDevice.close()

    const message = await SmsMessage.findBy('uid', itemOf<{ uid: string }>(response).uid)
    assert.equal(message!.status, SmsStatus.QUEUED)
    assert.equal(message!.errorCode, ErrorCode.NO_GATEWAY_AVAILABLE)
    assert.include(message!.errorMessage!, 'offline')
  })

  test('the tenant sees its phones, slots and today’s results', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone([0, 1])
    await claim(client, tenant.bearer, code, 'Kassa')

    const response = await send(client, tenant.bearer, { device: code, slot: 0 })
    const uid = itemOf<{ uid: string }>(response).uid
    await SmsDispatcher.dispatchBatch()
    await device.waitFor(ServerEvent.SMS_SEND)
    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    await device.waitFor(ServerEvent.RESULT_ACK)

    const list = await client.get('/api/v1/devices').header('authorization', tenant.bearer)
    await device.close()

    list.assertStatus(200)
    const [phone] = collectionOf<{
      code: string
      name: string
      online: boolean
      sims: { slot: number; today: { sent: number; failed: number } }[]
    }>(list)

    assert.equal(phone.code, code)
    assert.equal(phone.name, 'Kassa')
    assert.isTrue(phone.online)
    assert.lengthOf(phone.sims, 2)
    assert.equal(phone.sims[0].today.sent, 1)
    assert.equal(phone.sims[1].today.sent, 0)
  })

  test('the message list can be narrowed to one phone', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()
    await claim(client, tenant.bearer, code)

    await send(client, tenant.bearer, { device: code })
    await send(client, tenant.bearer, {})

    const response = await client
      .get('/api/v1/sms')
      .qs({ device: code })
      .header('authorization', tenant.bearer)
    await device.close()

    assert.lengthOf(collectionOf(response), 1)
  })

  test('another tenant’s phone is a 404', async ({ client }) => {
    const owner = await createTestClient({ abilities: ALL })
    const stranger = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()
    await claim(client, owner.bearer, code)

    const response = await client
      .get(`/api/v1/devices/${code}`)
      .header('authorization', stranger.bearer)
    await device.close()

    response.assertStatus(404)
  })

  /**
   * Releasing a phone settles what was waiting for it: those messages can no
   * longer go anywhere, and waiting forever would hide that.
   */
  test('releasing a phone fails what was waiting for it and frees it', async ({
    client,
    assert,
  }) => {
    const tenant = await createTestClient({ abilities: ALL })
    const other = await createTestClient({ abilities: ALL })
    const { device, code } = await freshPhone()
    await claim(client, tenant.bearer, code)
    await device.close()

    const response = await send(client, tenant.bearer, { device: code })
    const uid = itemOf<{ uid: string }>(response).uid

    const released = await client
      .post(`/api/v1/devices/${code}/release`)
      .header('authorization', tenant.bearer)
    released.assertStatus(200)

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.status, SmsStatus.FAILED)
    assert.equal(message!.errorCode, ErrorCode.DEVICE_RELEASED)

    const reclaimed = await claim(client, other.bearer, code)
    reclaimed.assertStatus(201)
  })

  test('device management needs its ability', async ({ client }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { device, code } = await freshPhone()

    const response = await claim(client, tenant.bearer, code)
    await device.close()

    response.assertStatus(403)
  })
})
