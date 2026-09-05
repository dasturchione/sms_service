import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  createApprovedGateway,
  createPlatformOperator,
  eventually,
  FakeDevice,
  startGatewayServer,
  stopGatewayServer,
} from '#tests/gateway_helpers'
import { createTestClient, collectionOf, itemOf } from '#tests/helpers'
import { db } from '#tests/db'
import UssdService from '#services/ussd/ussd_service'
import BalanceScheduler from '#services/ussd/balance_scheduler'
import OperatorUssdCommand from '#models/operator_ussd_command'
import SimProfile from '#models/sim_profile'
import UssdRequest from '#models/ussd_request'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { UssdKind, UssdStatus } from '#enums/ussd'
import { ClientEvent, ServerEvent } from '#realtime/protocol'
import ussdConfig from '#config/ussd'

/**
 * Operators are seeded reference data and the functional suite starts empty,
 * so each test that needs a code writes the one it depends on.
 */
async function configureCommand(
  operatorId: number,
  kind: UssdKind,
  values: { command: string; parserKey: string; steps?: string[] } = {
    command: '*102#',
    parserKey: 'beeline.sms_balance',
  }
) {
  return OperatorUssdCommand.updateOrCreate(
    { operatorId, kind },
    {
      operatorId,
      kind,
      command: values.command,
      parserKey: values.parserKey,
      steps: values.steps ?? [],
      isActive: true,
    }
  )
}

test.group('USSD sessions', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  test('a balance check travels to the device and lands on the SIM', async ({ assert }) => {
    const { simProfile, token } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const request = await UssdService.request(simProfile.id, UssdKind.SMS_BALANCE)

    const frame = await device.waitFor(ServerEvent.USSD_EXECUTE)
    const payload = frame.data as { requestId: string; command: string; simSlot: number }

    assert.equal(payload.requestId, request.uid)
    assert.equal(payload.command, '*102#')
    assert.equal(payload.simSlot, 0)

    device.send(ClientEvent.USSD_RESULT, {
      requestId: request.uid,
      status: 'success',
      response: 'Qoldiq: 240 SMS',
    })

    await eventually(async () => {
      const stored = await UssdRequest.findBy('uid', request.uid)
      return stored?.status === UssdStatus.SUCCESS
    })

    const sim = await SimProfile.find(simProfile.id)
    assert.equal(sim!.smsBalance, 240)
    assert.isNotNull(sim!.balanceCheckedAt)
    assert.equal(sim!.balanceFailures, 0)
  })

  /**
   * An operator rewording its reply must show up as something to fix, not as a
   * balance that quietly stopped moving.
   */
  test('records a reply it cannot read as a parse failure', async ({ assert }) => {
    const { simProfile, token } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const request = await UssdService.request(simProfile.id, UssdKind.SMS_BALANCE)
    await device.waitFor(ServerEvent.USSD_EXECUTE)

    device.send(ClientEvent.USSD_RESULT, {
      requestId: request.uid,
      status: 'success',
      response: 'Xizmat vaqtincha ishlamaydi',
    })

    await eventually(async () => {
      const stored = await UssdRequest.findBy('uid', request.uid)
      return stored?.status === UssdStatus.FAILED
    })

    const stored = await UssdRequest.findBy('uid', request.uid)
    assert.equal(stored!.errorCode, ErrorCode.USSD_PARSE_FAILED)

    /**
     * The verbatim text is kept: it is the only evidence of what the operator
     * now answers.
     */
    assert.equal(stored!.rawResponse, 'Xizmat vaqtincha ishlamaydi')

    const sim = await SimProfile.find(simProfile.id)
    assert.isNull(sim!.smsBalance)
    assert.equal(sim!.balanceFailures, 1)
  })

  /**
   * A phone that cannot run USSD will not start being able to, so it comes out
   * of the scheduler rather than being retried on the interval.
   */
  test('stops asking a device that says USSD is unsupported', async ({ assert }) => {
    const { simProfile, token } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const request = await UssdService.request(simProfile.id, UssdKind.SMS_BALANCE)
    await device.waitFor(ServerEvent.USSD_EXECUTE)

    device.send(ClientEvent.USSD_RESULT, { requestId: request.uid, status: 'unsupported' })

    await eventually(async () => {
      const sim = await SimProfile.find(simProfile.id)
      return sim?.ussdSupported === false
    })

    const stored = await UssdRequest.findBy('uid', request.uid)
    assert.equal(stored!.status, UssdStatus.UNSUPPORTED)

    await assert.rejects(() => UssdService.request(simProfile.id, UssdKind.SMS_BALANCE))
  })

  /**
   * A compromised phone must not be able to write another device's balance,
   * which is a number the dispatcher routes on.
   */
  test('ignores a result from a device that does not hold the SIM', async ({ assert }) => {
    const owner = await createApprovedGateway()
    const stranger = await createApprovedGateway()
    await configureCommand(owner.simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const ownerDevice = await FakeDevice.connect(owner.token)
    await ownerDevice.waitFor(ServerEvent.SESSION_READY)

    const strangerDevice = await FakeDevice.connect(stranger.token)
    await strangerDevice.waitFor(ServerEvent.SESSION_READY)

    const request = await UssdService.request(owner.simProfile.id, UssdKind.SMS_BALANCE)
    await ownerDevice.waitFor(ServerEvent.USSD_EXECUTE)

    strangerDevice.send(ClientEvent.USSD_RESULT, {
      requestId: request.uid,
      status: 'success',
      response: 'Qoldiq: 999 SMS',
    })

    await strangerDevice.waitFor(ServerEvent.RESULT_ACK)

    const sim = await SimProfile.find(owner.simProfile.id)
    assert.isNull(sim!.smsBalance)
  })

  test('refuses to start a session on a device that is not connected', async ({ assert }) => {
    const { simProfile } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    await assert.rejects(() => UssdService.request(simProfile.id, UssdKind.SMS_BALANCE))
  })

  /**
   * A dialogue can be swallowed whole. Without the sweep the request would sit
   * in `sending` forever and the scheduler would never ask again.
   */
  test('fails a session the device never answered', async ({ assert }) => {
    const { simProfile, token } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const request = await UssdService.request(simProfile.id, UssdKind.SMS_BALANCE)
    await device.waitFor(ServerEvent.USSD_EXECUTE)

    await db()
      .from('ussd_requests')
      .where('uid', request.uid)
      .update({
        requested_at: DateTime.now()
          .minus({ seconds: ussdConfig.timeoutSeconds + 10 })
          .toSQL(),
      })

    assert.equal(await UssdService.sweepStaleRequests(), 1)

    const stored = await UssdRequest.findBy('uid', request.uid)
    assert.equal(stored!.status, UssdStatus.FAILED)

    /**
     * The failed check still moves the timestamp, so the scheduler backs off
     * instead of hammering the same SIM on every pass.
     */
    const sim = await SimProfile.find(simProfile.id)
    assert.equal(sim!.balanceFailures, 1)
    assert.isNotNull(sim!.balanceCheckedAt)
  })
})

test.group('balance scheduler', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  test('checks a SIM that has never been read', async ({ assert }) => {
    const { simProfile, token } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    assert.equal(await BalanceScheduler.run(), 1)
    await device.waitFor(ServerEvent.USSD_EXECUTE)
  })

  test('leaves a SIM alone until its interval has passed', async ({ assert }) => {
    const { simProfile, token } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    await db()
      .from('sim_profiles')
      .where('id', simProfile.id)
      .update({ balance_checked_at: DateTime.now().minus({ minutes: 5 }).toSQL() })

    assert.equal(await BalanceScheduler.run(), 0)
  })

  test('gives up on a SIM whose code keeps failing', async ({ assert }) => {
    const { simProfile, token } = await createApprovedGateway()
    await configureCommand(simProfile.operatorId!, UssdKind.SMS_BALANCE)

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    await db()
      .from('sim_profiles')
      .where('id', simProfile.id)
      .update({ balance_failures: ussdConfig.balance.giveUpAfterFailures })

    assert.equal(await BalanceScheduler.run(), 0)
  })

  test('skips an operator with no code configured', async ({ assert }) => {
    const { token } = await createApprovedGateway()

    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    assert.equal(await BalanceScheduler.run(), 0)
  })
})

test.group('operator administration', () => {
  test('creates an operator and its USSD code', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()

    const created = await client
      .post('/api/v1/admin/operators')
      .header('authorization', bearer)
      .json({ name: 'Perfectum', code: 'perfectum', mcc: '434', mnc: '06', phonePrefixes: ['98'] })

    created.assertStatus(201)

    const command = await client
      .put('/api/v1/admin/operators/perfectum/ussd')
      .header('authorization', bearer)
      .json({ kind: UssdKind.BALANCE, command: '*100#', parserKey: 'generic.balance' })

    command.assertStatus(200)
    assert.equal(itemOf(command).command, '*100#')

    const read = await client
      .get('/api/v1/admin/operators/perfectum')
      .header('authorization', bearer)

    assert.lengthOf(read.body().data.ussdCommands, 1)
  })

  /**
   * A code whose replies nobody can read is a code that will silently stop
   * updating a balance, so it is refused at the door.
   */
  test('refuses a command with an unknown parser', async ({ client }) => {
    const { bearer } = await createPlatformOperator()

    await client
      .post('/api/v1/admin/operators')
      .header('authorization', bearer)
      .json({ name: 'Perfectum', code: 'perfectum' })

    const response = await client
      .put('/api/v1/admin/operators/perfectum/ussd')
      .header('authorization', bearer)
      .json({ kind: UssdKind.BALANCE, command: '*100#', parserKey: 'nope.balance' })

    response.assertStatus(422)
  })

  test('refuses something that is not a dialable code', async ({ client }) => {
    const { bearer } = await createPlatformOperator()

    await client
      .post('/api/v1/admin/operators')
      .header('authorization', bearer)
      .json({ name: 'Perfectum', code: 'perfectum' })

    const response = await client
      .put('/api/v1/admin/operators/perfectum/ussd')
      .header('authorization', bearer)
      .json({ kind: UssdKind.BALANCE, command: 'rm -rf', parserKey: 'generic.balance' })

    response.assertStatus(422)
  })

  /**
   * A tenant token authenticates against a different guard entirely, so it
   * cannot reach the admin surface even with every ability granted.
   */
  test('is closed to tenants', async ({ client }) => {
    const { bearer } = await createTestClient()

    const response = await client.get('/api/v1/admin/operators').header('authorization', bearer)

    response.assertStatus(401)
  })
})

test.group('tenant balances', () => {
  test('lists the balances of the tenant own devices', async ({ client, assert }) => {
    const { tenant, bearer } = await createTestClient({
      abilities: [ClientAbility.BALANCE_READ],
    })

    const { simProfile } = await createApprovedGateway({ tenantId: tenant.id })
    await db().from('sim_profiles').where('id', simProfile.id).update({
      sms_balance: 120,
      money_balance: 1_250_000,
      balance_currency: 'UZS',
      balance_checked_at: DateTime.now().toSQL(),
    })

    const response = await client.get('/api/v1/balances').header('authorization', bearer)

    response.assertStatus(200)

    const rows = collectionOf(response)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].smsBalance, 120)
    assert.equal(rows[0].moneyBalance, 1_250_000)
    assert.equal(response.body().meta.checkedSims, 1)
  })

  /**
   * A shared pool SIM carries several tenants' traffic: its balance is
   * platform information, and showing it would leak how much others send.
   */
  test('does not show a shared pool device', async ({ client, assert }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.BALANCE_READ] })

    await createApprovedGateway({ tenantId: null })

    const response = await client.get('/api/v1/balances').header('authorization', bearer)

    assert.lengthOf(collectionOf(response), 0)
  })

  test('requires the balance:read ability', async ({ client }) => {
    const { bearer } = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const response = await client.get('/api/v1/balances').header('authorization', bearer)

    response.assertStatus(403)
  })
})
