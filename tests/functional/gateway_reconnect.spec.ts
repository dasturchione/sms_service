import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { createTestClient } from '#tests/helpers'
import {
  createApprovedGateway,
  eventually,
  FakeDevice,
  startGatewayServer,
  stopGatewayServer,
} from '#tests/gateway_helpers'
import SmsDispatcher from '#services/sms/sms_dispatcher'
import Gateway from '#models/gateway'
import GatewaySession from '#models/gateway_session'
import connectionManager from '#realtime/connection_manager'
import { ClientAbility } from '#enums/ability'
import { GatewayStatus } from '#enums/gateway_status'
import { ClientEvent, ServerEvent } from '#realtime/protocol'
import { db } from '#tests/db'

/**
 * A phone on a flaky link often opens a new socket before the server has
 * noticed the old one is dead. These tests pin down what happens when the
 * old one finally closes.
 */
test.group('gateway reconnect', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  /**
   * The production incident: the replaced socket's teardown marked the
   * gateway offline while the new socket was alive, and nothing was sent
   * until the app was restarted the next morning.
   */
  test('a replaced socket closing does not take the device offline', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { gateway, token } = await createApprovedGateway()

    const first = await FakeDevice.connect(token)
    await first.waitFor(ServerEvent.SESSION_READY)

    const second = await FakeDevice.connect(token)
    await second.waitFor(ServerEvent.SESSION_READY)

    /**
     * The server closes the superseded socket itself; wait until its
     * teardown has run, which is when the old code did the damage.
     */
    await eventually(async () => {
      const open = await GatewaySession.query()
        .where('gateway_id', gateway.id)
        .whereNull('disconnected_at')
      return open.length === 1
    })

    await gateway.refresh()
    assert.equal(gateway.status, GatewayStatus.ONLINE)

    await client
      .post('/api/v1/sms')
      .header('authorization', tenant.bearer)
      .json({ to: '901234567', message: 'salom' })

    const outcome = await SmsDispatcher.dispatchBatch()
    assert.equal(outcome.dispatched, 1)

    await second.waitFor(ServerEvent.SMS_SEND)

    await first.close()
    await second.close()
  })

  /**
   * The disconnect timeline still records the replaced session, so support
   * can see the reconnect happened.
   */
  test('the replaced session is closed with its reason', async ({ assert }) => {
    const { gateway, token } = await createApprovedGateway()

    const first = await FakeDevice.connect(token)
    await first.waitFor(ServerEvent.SESSION_READY)
    const second = await FakeDevice.connect(token)
    await second.waitFor(ServerEvent.SESSION_READY)

    await eventually(async () => {
      const closed = await GatewaySession.query()
        .where('gateway_id', gateway.id)
        .whereNotNull('disconnected_at')
      return closed.length === 1
    })

    const sessions = await GatewaySession.query().where('gateway_id', gateway.id).orderBy('id')
    assert.lengthOf(sessions, 2)
    assert.isNotNull(sessions[0].disconnectedAt)
    assert.isNull(sessions[1].disconnectedAt)

    await second.close()
  })

  /**
   * Defence in depth: whatever leaves a gateway recorded offline under a live
   * socket, the next persisted heartbeat corrects it.
   */
  test('a heartbeat restores a gateway wrongly recorded offline', async ({ assert }) => {
    const { gateway, token } = await createApprovedGateway()

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    await db().from('gateways').where('id', gateway.id).update({ status: GatewayStatus.OFFLINE })
    connectionManager.get(gateway.id)!.persistedAt = DateTime.now().minus({ minutes: 5 })

    device.send(ClientEvent.HEARTBEAT, { battery: 80, network: 'wifi' })

    await eventually(async () => {
      const fresh = await Gateway.findOrFail(gateway.id)
      return fresh.status === GatewayStatus.ONLINE
    })

    await device.close()
    assert.isTrue(true)
  })

  test('a heartbeat never revives a disabled gateway', async ({ assert }) => {
    const { gateway, token } = await createApprovedGateway()

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    await db().from('gateways').where('id', gateway.id).update({ status: GatewayStatus.DISABLED })
    connectionManager.get(gateway.id)!.persistedAt = DateTime.now().minus({ minutes: 5 })

    device.send(ClientEvent.HEARTBEAT, { battery: 80, network: 'wifi' })

    /**
     * The heartbeat flush writes `last_seen_at`; once that has landed, the
     * status check has run too.
     */
    await eventually(async () => {
      const fresh = await Gateway.findOrFail(gateway.id)
      return fresh.battery === 80
    })

    const fresh = await Gateway.findOrFail(gateway.id)
    assert.equal(fresh.status, GatewayStatus.DISABLED)

    await device.close()
  })

  /**
   * A real disconnect of the current socket must still take the device
   * offline, or the dispatcher would keep routing to a phone that is gone.
   */
  test('closing the current socket still marks the device offline', async ({ assert }) => {
    const { gateway, token } = await createApprovedGateway()

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)
    await device.close()

    await eventually(async () => {
      const fresh = await Gateway.findOrFail(gateway.id)
      return fresh.status === GatewayStatus.OFFLINE
    })

    assert.isTrue(true)
  })
})
