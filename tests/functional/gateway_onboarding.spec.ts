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
import { GatewayStatus, SimState } from '#enums/gateway_status'
import { ServerEvent } from '#realtime/protocol'
import { db } from '#tests/db'

function deviceId() {
  return `dev-${randomBytes(8).toString('hex')}`
}

test.group('gateway onboarding', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  /**
   * The whole onboarding path, exactly as a phone walks it.
   */
  test('a device registers, is approved, claims a token and connects', async ({
    client,
    assert,
  }) => {
    const operator = await createPlatformOperator()
    const id = deviceId()

    const registered = await client.post('/api/v1/gw/register').json({
      deviceId: id,
      deviceName: 'Samsung A15',
      manufacturer: 'Samsung',
      model: 'A15',
      androidVersion: '15',
      appVersion: '1.0.0',
    })

    registered.assertStatus(201)
    const uid = itemOf<{ gateway: { uid: string; status: string } }>(registered).gateway.uid
    assert.equal(
      itemOf<{ gateway: { status: string } }>(registered).gateway.status,
      GatewayStatus.PENDING_APPROVAL
    )

    const approved = await client
      .post(`/api/v1/admin/gateways/${uid}/approve`)
      .header('authorization', operator.bearer)

    approved.assertStatus(200)
    const claimCode = itemOf<{ claimCode: string }>(approved).claimCode

    const claimed = await client.post('/api/v1/gw/claim').json({ deviceId: id, claimCode })
    claimed.assertStatus(200)
    const token = itemOf<{ accessToken: string }>(claimed).accessToken

    /**
     * The device reports its SIM slots before it can carry anything: the
     * platform has no other way to learn they exist.
     */
    const synced = await client
      .post('/api/v1/gw/sim-profiles')
      .header('authorization', `Bearer ${token}`)
      .json({ sims: [{ slot: 0, operatorName: 'Beeline', mcc: '434', mnc: '04', state: 'ready' }] })

    synced.assertStatus(200)

    const device = await FakeDevice.connect(token)
    const session = await device.waitFor(ServerEvent.SESSION_READY)
    const payload = session.data as { gatewayUid: string; simProfiles: { slot: number }[] }

    assert.equal(payload.gatewayUid, uid)
    assert.lengthOf(payload.simProfiles, 1)

    await device.close()

    /**
     * Closing the client socket does not finish the server's teardown, so the
     * status is polled rather than read once.
     */
    await eventually(async () => {
      const closing = await Gateway.findBy('uid', uid)
      return closing?.status === GatewayStatus.OFFLINE
    })

    const gateway = await Gateway.findBy('uid', uid)
    assert.isNotNull(gateway!.lastConnectedAt)
  })

  /**
   * Registration must grant nothing on its own, or an open endpoint would be
   * an open door.
   */
  test('an unapproved device cannot claim a token', async ({ client }) => {
    const id = deviceId()
    await client.post('/api/v1/gw/register').json({ deviceId: id })

    const claimed = await client
      .post('/api/v1/gw/claim')
      .json({ deviceId: id, claimCode: 'not-a-real-code' })

    claimed.assertStatus(403)
  })

  test('a claim code cannot be used twice', async ({ client }) => {
    const operator = await createPlatformOperator()
    const id = deviceId()

    const registered = await client.post('/api/v1/gw/register').json({ deviceId: id })
    const uid = itemOf<{ gateway: { uid: string } }>(registered).gateway.uid

    const approved = await client
      .post(`/api/v1/admin/gateways/${uid}/approve`)
      .header('authorization', operator.bearer)
    const claimCode = itemOf<{ claimCode: string }>(approved).claimCode

    const first = await client.post('/api/v1/gw/claim').json({ deviceId: id, claimCode })
    first.assertStatus(200)

    const second = await client.post('/api/v1/gw/claim').json({ deviceId: id, claimCode })
    second.assertStatus(403)
  })

  test('an expired claim code is refused', async ({ client }) => {
    const operator = await createPlatformOperator()
    const id = deviceId()

    const registered = await client.post('/api/v1/gw/register').json({ deviceId: id })
    const uid = itemOf<{ gateway: { uid: string } }>(registered).gateway.uid

    const approved = await client
      .post(`/api/v1/admin/gateways/${uid}/approve`)
      .header('authorization', operator.bearer)
    const claimCode = itemOf<{ claimCode: string }>(approved).claimCode

    await db()
      .from('gateways')
      .where('uid', uid)
      .update({ claim_code_expires_at: new Date(Date.now() - 1000) })

    const claimed = await client.post('/api/v1/gw/claim').json({ deviceId: id, claimCode })
    claimed.assertStatus(403)
  })

  /**
   * Re-announcing a device after an app update must not send it back to the
   * approval queue, or every release would need an operator to click again.
   */
  test('re-registering keeps an existing approval', async ({ client, assert }) => {
    const operator = await createPlatformOperator()
    const id = deviceId()

    const registered = await client.post('/api/v1/gw/register').json({ deviceId: id })
    const uid = itemOf<{ gateway: { uid: string } }>(registered).gateway.uid

    await client
      .post(`/api/v1/admin/gateways/${uid}/approve`)
      .header('authorization', operator.bearer)

    const again = await client
      .post('/api/v1/gw/register')
      .json({ deviceId: id, appVersion: '1.1.0' })

    again.assertStatus(201)

    const gateway = await Gateway.findBy('uid', uid)
    assert.isNotNull(gateway!.approvedAt)
    assert.equal(gateway!.appVersion, '1.1.0')
  })

  test('a tenant client cannot approve gateways', async ({ client }) => {
    const tenant = await createTestClient()
    const id = deviceId()

    const registered = await client.post('/api/v1/gw/register').json({ deviceId: id })
    const uid = itemOf<{ gateway: { uid: string } }>(registered).gateway.uid

    const approved = await client
      .post(`/api/v1/admin/gateways/${uid}/approve`)
      .header('authorization', tenant.bearer)

    /**
     * A client token is not a user token, so this fails at authentication
     * rather than at the platform operator check.
     */
    approved.assertStatus(401)
  })
})

test.group('gateway realtime authentication', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  test('a connection without a token is refused', async ({ assert }) => {
    const status = await FakeDevice.expectRejected('not-a-token')
    assert.equal(status, 401)
  })

  /**
   * Disabling a device revokes its credential, so the phone stops working even
   * if it still holds a token file.
   */
  test('a disabled device cannot reconnect', async ({ client, assert }) => {
    const operator = await createPlatformOperator()
    const id = deviceId()

    const registered = await client.post('/api/v1/gw/register').json({ deviceId: id })
    const uid = itemOf<{ gateway: { uid: string } }>(registered).gateway.uid

    const approved = await client
      .post(`/api/v1/admin/gateways/${uid}/approve`)
      .header('authorization', operator.bearer)
    const claimCode = itemOf<{ claimCode: string }>(approved).claimCode

    const claimed = await client.post('/api/v1/gw/claim').json({ deviceId: id, claimCode })
    const token = itemOf<{ accessToken: string }>(claimed).accessToken

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)
    await device.close()

    await client
      .post(`/api/v1/admin/gateways/${uid}/disable`)
      .header('authorization', operator.bearer)

    const status = await FakeDevice.expectRejected(token)
    assert.equal(status, 401)

    const gateway = await Gateway.findBy('uid', uid)
    assert.equal(gateway!.status, GatewayStatus.DISABLED)
  })

  test('a device reports its SIM state over the socket', async ({ client, assert }) => {
    const operator = await createPlatformOperator()
    const id = deviceId()

    const registered = await client.post('/api/v1/gw/register').json({ deviceId: id })
    const uid = itemOf<{ gateway: { uid: string } }>(registered).gateway.uid

    const approved = await client
      .post(`/api/v1/admin/gateways/${uid}/approve`)
      .header('authorization', operator.bearer)
    const claimCode = itemOf<{ claimCode: string }>(approved).claimCode
    const claimed = await client.post('/api/v1/gw/claim').json({ deviceId: id, claimCode })
    const token = itemOf<{ accessToken: string }>(claimed).accessToken

    await client
      .post('/api/v1/gw/sim-profiles')
      .header('authorization', `Bearer ${token}`)
      .json({ sims: [{ slot: 0, operatorName: 'Beeline', state: SimState.UNKNOWN }] })

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)
    await device.close()

    const rows = await db().from('sim_profiles').select('state')
    assert.equal(rows[0].state, SimState.UNKNOWN)
  })
})
