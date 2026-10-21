import { test } from '@japa/runner'
import { randomBytes } from 'node:crypto'
import {
  createPlatformOperator,
  eventually,
  FakeDevice,
  startGatewayServer,
  stopGatewayServer,
} from '#tests/gateway_helpers'
import { createTestClient, itemOf } from '#tests/helpers'
import Gateway from '#models/gateway'
import { GatewayAssignment, GatewayStatus, SimState } from '#enums/gateway_status'
import { ErrorCode } from '#enums/error_code'
import { ServerEvent } from '#realtime/protocol'
import { db } from '#tests/db'

function deviceId() {
  return `dev-${randomBytes(8).toString('hex')}`
}

type Registered = {
  gateway: { uid: string; code: string; assignment: string }
  accessToken: string | null
  code: string
}

async function register(client: any, id = deviceId(), headers: Record<string, string> = {}) {
  const request = client.post('/api/v1/gw/register')
  for (const [name, value] of Object.entries(headers)) request.header(name, value)

  const response = await request.json({
    deviceId: id,
    deviceName: 'Samsung A15',
    manufacturer: 'Samsung',
    model: 'A15',
    androidVersion: '15',
    appVersion: '1.0.0',
  })

  return { response, id, body: itemOf<Registered>(response) }
}

/**
 * There is no approval step: a phone registers, gets its credential and
 * connects at once. What it is for is decided afterwards.
 */
test.group('gateway onboarding', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  test('a new device gets a token and a code straight away', async ({ client, assert }) => {
    const { response, body } = await register(client)

    response.assertStatus(201)
    assert.isString(body.accessToken)
    assert.match(body.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.equal(body.gateway.assignment, GatewayAssignment.UNASSIGNED)
  })

  test('it connects at once and is told it is waiting to be claimed', async ({
    client,
    assert,
  }) => {
    const { body } = await register(client)

    const device = await FakeDevice.connect(body.accessToken!)
    const session = await device.waitFor(ServerEvent.SESSION_READY)
    await device.close()

    const data = session.data as { code: string; assignment: string; tenantName: string | null }
    assert.equal(data.code, body.code)
    assert.equal(data.assignment, GatewayAssignment.UNASSIGNED)
    assert.isNull(data.tenantName)
  })

  /**
   * Knowing a phone's id must not be enough to become that phone and receive
   * its messages.
   */
  test('an existing device id without its token is refused', async ({ client, assert }) => {
    const first = await register(client)
    const second = await register(client, first.id)

    second.response.assertStatus(409)
    assert.equal(second.response.body().error.code, ErrorCode.DEVICE_ALREADY_REGISTERED)
  })

  test('the device itself can refresh its details, keeping its assignment', async ({
    client,
    assert,
  }) => {
    const first = await register(client)
    await Gateway.query()
      .where('uid', first.body.gateway.uid)
      .update({ assignment: GatewayAssignment.POOL })

    const again = await client
      .post('/api/v1/gw/register')
      .header('authorization', `Bearer ${first.body.accessToken}`)
      .json({ deviceId: first.id, appVersion: '1.1.0' })

    again.assertStatus(200)
    assert.isNull(itemOf<Registered>(again).accessToken)

    const gateway = await Gateway.findBy('uid', first.body.gateway.uid)
    assert.equal(gateway!.appVersion, '1.1.0')
    assert.equal(gateway!.assignment, GatewayAssignment.POOL)
  })

  test('an operator puts a device into the pool and the phone hears about it', async ({
    client,
    assert,
  }) => {
    const operator = await createPlatformOperator()
    const { body } = await register(client)

    const device = await FakeDevice.connect(body.accessToken!)
    await device.waitFor(ServerEvent.SESSION_READY)

    const response = await client
      .patch(`/api/v1/admin/gateways/${body.gateway.uid}`)
      .header('authorization', operator.bearer)
      .json({ assignment: GatewayAssignment.POOL })

    response.assertStatus(200)

    const update = await device.waitFor(ServerEvent.CONFIG_UPDATE)
    await device.close()

    assert.equal((update.data as { assignment: string }).assignment, GatewayAssignment.POOL)
  })

  test('an operator can give a device to a tenant', async ({ client, assert }) => {
    const operator = await createPlatformOperator()
    const tenant = await createTestClient()
    const { body } = await register(client)

    const response = await client
      .patch(`/api/v1/admin/gateways/${body.gateway.uid}`)
      .header('authorization', operator.bearer)
      .json({ assignment: GatewayAssignment.TENANT, tenant: tenant.tenant.uid })

    response.assertStatus(200)

    const gateway = await Gateway.findBy('uid', body.gateway.uid)
    assert.equal(gateway!.assignment, GatewayAssignment.TENANT)
    assert.equal(gateway!.tenantId, tenant.tenant.id)
  })

  test('a tenant client cannot change assignments', async ({ client }) => {
    const tenant = await createTestClient()
    const { body } = await register(client)

    const response = await client
      .patch(`/api/v1/admin/gateways/${body.gateway.uid}`)
      .header('authorization', tenant.bearer)
      .json({ assignment: GatewayAssignment.POOL })

    response.assertStatus(401)
  })
})

test.group('gateway service control', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  test('a connection without a token is refused', async ({ assert }) => {
    assert.equal(await FakeDevice.expectRejected('not-a-token'), 401)
  })

  /**
   * Disabling blocks the phone but keeps its credential, so enabling it again
   * needs nobody to touch the phone.
   */
  test('a disabled device is refused, and the same token works once enabled', async ({
    client,
    assert,
  }) => {
    const operator = await createPlatformOperator()
    const { body } = await register(client)

    await client
      .post(`/api/v1/admin/gateways/${body.gateway.uid}/disable`)
      .header('authorization', operator.bearer)

    assert.equal(await FakeDevice.expectRejected(body.accessToken!), 403)

    await client
      .post(`/api/v1/admin/gateways/${body.gateway.uid}/enable`)
      .header('authorization', operator.bearer)

    const device = await FakeDevice.connect(body.accessToken!)
    await device.waitFor(ServerEvent.SESSION_READY)
    await device.close()
  })

  /**
   * For a lost or stolen phone: the credential is gone for good, and the phone,
   * if it is still around, can only start over as a new device.
   */
  test('a forgotten device loses its credential and can register anew', async ({
    client,
    assert,
  }) => {
    const operator = await createPlatformOperator()
    const { body, id } = await register(client)

    const removed = await client
      .delete(`/api/v1/admin/gateways/${body.gateway.uid}`)
      .header('authorization', operator.bearer)

    removed.assertStatus(204)
    assert.equal(await FakeDevice.expectRejected(body.accessToken!), 401)

    const again = await register(client, id)
    again.response.assertStatus(201)
    assert.notEqual(again.body.gateway.uid, body.gateway.uid)
  })

  test('a device reports its SIM state over the socket', async ({ client, assert }) => {
    const { body } = await register(client)

    await client
      .post('/api/v1/gw/sim-profiles')
      .header('authorization', `Bearer ${body.accessToken}`)
      .json({ sims: [{ slot: 0, operatorName: 'Beeline', state: SimState.UNKNOWN }] })

    const device = await FakeDevice.connect(body.accessToken!)
    await device.waitFor(ServerEvent.SESSION_READY)
    await device.close()

    await eventually(async () => {
      const gateway = await Gateway.findBy('uid', body.gateway.uid)
      return gateway?.status === GatewayStatus.OFFLINE
    })

    const rows = await db().from('sim_profiles').select('state')
    assert.equal(rows[0].state, SimState.UNKNOWN)
  })
})
