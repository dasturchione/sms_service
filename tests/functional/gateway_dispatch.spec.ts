import { test } from '@japa/runner'
import { createTestClient, itemOf } from '#tests/helpers'
import {
  createApprovedGateway,
  eventually,
  FakeDevice,
  startGatewayServer,
  stopGatewayServer,
} from '#tests/gateway_helpers'
import SmsDispatcher from '#services/sms/sms_dispatcher'
import SmsResultService from '#services/sms/sms_result_service'
import SmsMessage from '#models/sms_message'
import SmsAttempt from '#models/sms_attempt'
import SimProfile from '#models/sim_profile'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { SmsAttemptStatus, SmsStatus } from '#enums/sms_status'
import { ClientEvent, ServerEvent } from '#realtime/protocol'
import { db } from '#tests/db'

test.group('gateway dispatch', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  async function queueMessage(client: any, bearer: string, body = 'Kod: 483921') {
    const response = await client
      .post('/api/v1/sms')
      .header('authorization', bearer)
      .json({ to: '901234567', message: body })

    return itemOf<{ uid: string }>(response).uid
  }

  test('a message travels from the API to a device and back', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { token } = await createApprovedGateway()
    const device = await FakeDevice.connect(token)

    await device.waitFor(ServerEvent.SESSION_READY)

    const uid = await queueMessage(client, tenant.bearer)

    const outcome = await SmsDispatcher.dispatchBatch()
    assert.equal(outcome.dispatched, 1)

    const job = await device.waitFor(ServerEvent.SMS_SEND)
    const payload = job.data as { jobId: string; to: string; message: string; simSlot: number }

    assert.equal(payload.jobId, uid)
    assert.equal(payload.to, '+998901234567')
    assert.equal(payload.simSlot, 0)

    /**
     * The verbatim body must go on the wire, not the masked copy the tenant
     * asked us to retain.
     */
    assert.equal(payload.message, 'Kod: 483921')

    device.send(ClientEvent.SMS_ACK, { jobId: uid })
    await eventually(async () => {
      const message = await SmsMessage.findBy('uid', uid)
      return message?.status === SmsStatus.SENDING
    })

    device.send(ClientEvent.SMS_RESULT, {
      jobId: uid,
      status: 'sent',
      providerMessageId: 'android-983421',
    })

    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.status, SmsStatus.SENT)
    assert.equal(message!.providerMessageId, 'android-983421')
    assert.isNotNull(message!.sentAt)

    /**
     * The text that went on the wire is erased once it has served its purpose.
     */
    assert.isNull(message!.dispatchBody)

    const attempt = await SmsAttempt.query().where('sms_message_id', String(message!.id)).first()
    assert.equal(attempt!.status, SmsAttemptStatus.SENT)
  })

  test('the stored body still respects the tenant retention setting', async ({
    client,
    assert,
  }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { token } = await createApprovedGateway()
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const uid = await queueMessage(client, tenant.bearer, 'Kod: 483921')
    await SmsDispatcher.dispatchBatch()
    await device.waitFor(ServerEvent.SMS_SEND)
    await device.close()

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.messageBody, 'Kod: ••••••')
  })

  test('nothing is dispatched when no device is connected', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    await createApprovedGateway()

    const uid = await queueMessage(client, tenant.bearer)

    const outcome = await SmsDispatcher.dispatchBatch()

    assert.equal(outcome.dispatched, 0)

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.status, SmsStatus.QUEUED)
  })

  test('a device failure is retried on the next pass', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { token } = await createApprovedGateway()
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const uid = await queueMessage(client, tenant.bearer)
    await SmsDispatcher.dispatchBatch()
    await device.waitFor(ServerEvent.SMS_SEND)

    device.send(ClientEvent.SMS_RESULT, {
      jobId: uid,
      status: 'failed',
      errorCode: ErrorCode.SIM_NOT_READY,
      errorMessage: 'SIM card is not ready',
    })

    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await SmsMessage.findBy('uid', uid)

    /**
     * A transient failure goes back to the queue with a delay, and the attempt
     * it burned is recorded.
     */
    assert.equal(message!.status, SmsStatus.QUEUED)
    assert.equal(message!.attempts, 1)
    assert.equal(message!.errorCode, ErrorCode.SIM_NOT_READY)
    assert.isNotNull(message!.nextAttemptAt)
  })

  test('a permanent failure is not retried', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { token } = await createApprovedGateway()
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const uid = await queueMessage(client, tenant.bearer)
    await SmsDispatcher.dispatchBatch()
    await device.waitFor(ServerEvent.SMS_SEND)

    device.send(ClientEvent.SMS_RESULT, {
      jobId: uid,
      status: 'failed',
      errorCode: ErrorCode.INVALID_NUMBER,
      errorMessage: 'Not a subscriber',
    })

    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.status, SmsStatus.FAILED)
    assert.equal(message!.errorCode, ErrorCode.INVALID_NUMBER)
  })

  /**
   * A phone that receives a job and then loses power must not strand the
   * message. This is the property that makes delivery at-least-once.
   */
  test('a message whose lease expires returns to the queue', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { token } = await createApprovedGateway()
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const uid = await queueMessage(client, tenant.bearer)
    await SmsDispatcher.dispatchBatch()
    await device.waitFor(ServerEvent.SMS_SEND)
    await device.close()

    /**
     * Rather than waiting out the real ack window, move the lease into the
     * past: the sweep only cares that the deadline has passed.
     */
    await db()
      .from('sms_messages')
      .where('uid', uid)
      .update({ lease_expires_at: new Date(Date.now() - 1000) })

    const reclaimed = await SmsResultService.sweepExpiredLeases()
    assert.equal(reclaimed, 1)

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.status, SmsStatus.QUEUED)

    const attempt = await SmsAttempt.query().where('sms_message_id', String(message!.id)).first()
    assert.equal(attempt!.status, SmsAttemptStatus.TIMED_OUT)
    assert.equal(attempt!.errorCode, ErrorCode.LEASE_EXPIRED)
  })

  /**
   * A compromised phone must not be able to speak about traffic it does not
   * hold, or it could mark another device's messages as delivered.
   */
  test('a device cannot report on a job it does not hold', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const owner = await createApprovedGateway()
    const stranger = await createApprovedGateway()

    const ownerDevice = await FakeDevice.connect(owner.token)
    const strangerDevice = await FakeDevice.connect(stranger.token)
    await ownerDevice.waitFor(ServerEvent.SESSION_READY)
    await strangerDevice.waitFor(ServerEvent.SESSION_READY)

    const uid = await queueMessage(client, tenant.bearer)
    await SmsDispatcher.dispatchBatch()
    const job = await ownerDevice.waitFor(ServerEvent.SMS_SEND)

    strangerDevice.send(ClientEvent.SMS_RESULT, {
      jobId: (job.data as { jobId: string }).jobId,
      status: 'sent',
      providerMessageId: 'forged',
    })

    await strangerDevice.waitFor(ServerEvent.RESULT_ACK)
    await ownerDevice.close()
    await strangerDevice.close()

    const message = await SmsMessage.findBy('uid', uid)
    assert.notEqual(message!.status, SmsStatus.SENT)
    assert.isNull(message!.providerMessageId)
  })

  test('a duplicate result is ignored', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { token, simProfile } = await createApprovedGateway()
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const uid = await queueMessage(client, tenant.bearer)
    await SmsDispatcher.dispatchBatch()
    await device.waitFor(ServerEvent.SMS_SEND)

    const result = { jobId: uid, status: 'sent', providerMessageId: 'android-1' }
    device.send(ClientEvent.SMS_RESULT, result)
    await device.waitFor(ServerEvent.RESULT_ACK)

    device.send(ClientEvent.SMS_RESULT, result)
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    /**
     * The daily counter is the observable proof: applying the result twice
     * would bill the SIM twice for one message.
     */
    const profile = await SimProfile.find(simProfile.id)
    assert.equal(profile!.sentToday, 1)
  })
})

test.group('undeliverable messages', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  /**
   * A message with no body must never reach a subscriber as a blank SMS. This
   * is reachable for rows written before the dispatch body existed, and for
   * any future path that erases it too early.
   */
  test('a message with no body fails instead of being sent blank', async ({ client, assert }) => {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const { token } = await createApprovedGateway()
    const device = await FakeDevice.connect(token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', tenant.bearer)
      .json({ to: '901234567', message: 'Kod: 483921' })

    const uid = itemOf<{ uid: string }>(response).uid
    await db().from('sms_messages').where('uid', uid).update({ dispatch_body: null })

    const outcome = await SmsDispatcher.dispatchBatch()
    await device.close()

    assert.equal(outcome.dispatched, 0)
    assert.equal(outcome.undeliverable, 1)

    const message = await SmsMessage.findBy('uid', uid)
    assert.equal(message!.status, SmsStatus.FAILED)
    assert.equal(message!.errorCode, ErrorCode.BODY_UNAVAILABLE)
  })
})
