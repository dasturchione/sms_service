import { test } from '@japa/runner'
import { createTestClient, itemOf } from '#tests/helpers'
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
import { ClientAbility } from '#enums/ability'
import { SmsStatus } from '#enums/sms_status'
import { ServerEvent } from '#realtime/protocol'

/**
 * A device-wide send rate, on top of each SIM's own. A dual-SIM phone paced at
 * N per SIM would otherwise send 2N a minute.
 */
test.group('device pacing', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return () => stopGatewayServer(ws)
  })

  async function dualSim(deviceSmsPerMinute: number | null) {
    const { gateway, simProfile, token } = await createApprovedGateway({
      smsPerMinute: 600,
      maxInFlight: 50,
      deviceSmsPerMinute,
    })
    const second = await addSimProfile(gateway, 1, { smsPerMinute: 600 })

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    return { gateway, first: simProfile, second, device }
  }

  async function sendMany(client: any, bearer: string, count: number) {
    const uids: string[] = []
    for (let index = 0; index < count; index++) {
      const response = await client
        .post('/api/v1/sms')
        .header('authorization', bearer)
        .json({ to: `90333330${index}`, message: 'Eslatma' })
      uids.push(itemOf<{ uid: string }>(response).uid)
    }
    return uids
  }

  /**
   * One dispatch pass with every SIM window cleared: only the device's own
   * window is left to hold anything back.
   */
  async function passWithFreeSims() {
    await db().from('sim_profiles').update({ next_available_at: null })
    await db()
      .from('sms_messages')
      .where('status', SmsStatus.QUEUED)
      .update({ next_attempt_at: null })
    await SmsDispatcher.dispatchBatch()
  }

  async function assignedCount(uids: string[]) {
    const rows = await SmsMessage.query().whereIn('uid', uids).whereNot('status', SmsStatus.QUEUED)
    return rows.length
  }

  test('a device rate holds back its second SIM too', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { device } = await dualSim(1)

    const uids = await sendMany(client, tenant.bearer, 3)

    await passWithFreeSims()
    await passWithFreeSims()

    assert.equal(await assignedCount(uids), 1)

    /**
     * Once the device's window has passed, the next one goes.
     */
    await db().from('gateways').update({ next_available_at: null })
    await passWithFreeSims()

    assert.equal(await assignedCount(uids), 2)
    await device.close()
  })

  test('without a device rate both SIMs work in parallel', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { device } = await dualSim(null)

    const uids = await sendMany(client, tenant.bearer, 3)
    await passWithFreeSims()
    await passWithFreeSims()

    assert.equal(await assignedCount(uids), 3)
    await device.close()
  })

  test('an operator sets and clears the device rate', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const { gateway, device } = await dualSim(null)

    const set = await client
      .patch(`/api/v1/admin/gateways/${gateway.uid}`)
      .header('authorization', bearer)
      .json({ smsPerMinute: 20 })

    set.assertStatus(200)
    assert.equal(itemOf(set).smsPerMinute, 20)

    const cleared = await client
      .patch(`/api/v1/admin/gateways/${gateway.uid}`)
      .header('authorization', bearer)
      .json({ smsPerMinute: null })

    assert.isNull(itemOf(cleared).smsPerMinute)
    await device.close()
  })
})

test.group('recipient cap default', () => {
  /**
   * The cap used to default to 60 per operator. It is now off until set.
   */
  test('a new operator has no daily recipient cap', async ({ assert }) => {
    const operator = await ensureOperator('ucell')
    await operator.refresh()

    assert.isNull(operator.dailyRecipientLimit)
  })
})
