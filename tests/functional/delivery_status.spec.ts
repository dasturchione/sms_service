import { test } from '@japa/runner'
import { createTestClient, itemOf } from '#tests/helpers'
import {
  createApprovedGateway,
  FakeDevice,
  startGatewayServer,
  stopGatewayServer,
} from '#tests/gateway_helpers'
import { db } from '#tests/db'
import SmsDispatcher from '#services/sms/sms_dispatcher'
import SmsResultService from '#services/sms/sms_result_service'
import SmsMessage from '#models/sms_message'
import SmsAttempt from '#models/sms_attempt'
import { ClientAbility } from '#enums/ability'
import { ErrorCode } from '#enums/error_code'
import { SmsEvent } from '#enums/sms_event'
import { SmsAttemptStatus, SmsStatus } from '#enums/sms_status'
import { ClientEvent, ServerEvent } from '#realtime/protocol'

/**
 * Whether a message really went out, and whether it really arrived, has to be
 * known on the server, not only on the phone that sent it. Each test here pins
 * one way the two used to disagree.
 */
test.group('delivery status', (group) => {
  let ws: Awaited<ReturnType<typeof startGatewayServer>>

  group.each.setup(async () => {
    ws = await startGatewayServer()
    return async () => stopGatewayServer(ws)
  })

  async function dispatched(client: any) {
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })
    const gateway = await createApprovedGateway({ smsPerMinute: 600, maxInFlight: 10 })
    const device = await FakeDevice.connect(gateway.token)
    await device.waitFor(ServerEvent.SESSION_READY)

    const response = await client
      .post('/api/v1/sms')
      .header('authorization', tenant.bearer)
      .json({ to: '901234567', message: 'Kod: 483921' })
    const uid = itemOf<{ uid: string }>(response).uid

    await SmsDispatcher.dispatchBatch()
    await device.waitFor(ServerEvent.SMS_SEND)

    return { tenant, gateway, device, uid }
  }

  async function messageOf(uid: string) {
    return (await SmsMessage.findBy('uid', uid))!
  }

  /**
   * The phone sends the send result and the delivery report back to back. If
   * the report was handled first it used to be dropped, leaving the message at
   * `sent` while the phone's own log said "delivered".
   */
  test('a delivery report sent right behind its send result is not lost', async ({
    client,
    assert,
  }) => {
    const { device, uid } = await dispatched(client)

    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    device.send(ClientEvent.SMS_DELIVERED, { jobId: uid, status: 'delivered', statusCode: 0 })

    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const delivered = await messageOf(uid)
    assert.equal(delivered.status, SmsStatus.DELIVERED)
  })

  /**
   * A delivery report is proof the message was sent. If the send result was
   * lost on the way, the report alone must still settle the message.
   */
  test('a delivery report without a send result still settles the message', async ({
    client,
    assert,
  }) => {
    const { device, uid } = await dispatched(client)

    device.send(ClientEvent.SMS_DELIVERED, { jobId: uid, status: 'delivered', statusCode: 0 })
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await messageOf(uid)
    assert.equal(message.status, SmsStatus.DELIVERED)
    assert.isNotNull(message.sentAt)

    const attempt = await SmsAttempt.query().where('sms_message_id', String(message.id)).first()
    assert.equal(attempt!.status, SmsAttemptStatus.SENT)
  })

  test('a failed delivery report marks the message failed', async ({ client, assert }) => {
    const { device, uid } = await dispatched(client)

    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    await device.waitFor(ServerEvent.RESULT_ACK)

    device.send(ClientEvent.SMS_DELIVERED, { jobId: uid, status: 'failed', statusCode: 65 })
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await messageOf(uid)
    assert.equal(message.status, SmsStatus.FAILED)
    assert.equal(message.errorCode, ErrorCode.DELIVERY_FAILED)

    /**
     * Not retried: the operator already tried, and sending again would risk a
     * duplicate if the report was wrong.
     */
    assert.isNull(message.nextAttemptAt)
    assert.equal(message.attempts, 1)
  })

  /**
   * The acknowledgement names what it confirms, so the phone clears only that
   * row and keeps a delivery report it has not sent yet.
   */
  test('acknowledgements name the result they confirm', async ({ client, assert }) => {
    const { device, uid } = await dispatched(client)

    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    const sentAck = await device.waitFor(ServerEvent.RESULT_ACK)

    device.send(ClientEvent.SMS_DELIVERED, { jobId: uid, status: 'delivered' })
    const deliveredAck = await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    assert.deepEqual(sentAck.data, { jobId: uid, event: ClientEvent.SMS_RESULT })
    assert.deepEqual(deliveredAck.data, { jobId: uid, event: ClientEvent.SMS_DELIVERED })
  })

  /**
   * The phone sent the message but its report arrived after the lease ran out
   * and the message was queued again. It used to be thrown away, and the
   * message went out a second time.
   */
  test('a late send result after the lease expired is accepted, not resent', async ({
    client,
    assert,
  }) => {
    const { device, uid } = await dispatched(client)

    await db()
      .from('sms_messages')
      .where('uid', uid)
      .update({ lease_expires_at: new Date(Date.now() - 1000) })
    await SmsResultService.sweepExpiredLeases()

    const requeued = await messageOf(uid)
    assert.equal(requeued.status, SmsStatus.QUEUED)

    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await messageOf(uid)
    assert.equal(message.status, SmsStatus.SENT)
    assert.isNull(message.nextAttemptAt)

    /**
     * And the slot it used is counted as spent again: it was handed back when
     * the lease expired, but the message did go out through it.
     */
    const ledger = await db()
      .from('sim_daily_recipients')
      .where('recipient_normalized', '+998901234567')
      .first()
    assert.equal(ledger.messages_sent, 1)
  })

  /**
   * Same, but the message had already been handed to a second phone. That
   * attempt is called off so it does not send a duplicate.
   */
  test('a late success calls off the attempt that replaced it', async ({ client, assert }) => {
    const { device, uid } = await dispatched(client)

    await db()
      .from('sms_messages')
      .where('uid', uid)
      .update({ lease_expires_at: new Date(Date.now() - 1000) })
    await SmsResultService.sweepExpiredLeases()

    const second = await createApprovedGateway({ smsPerMinute: 600, maxInFlight: 10 })
    const secondDevice = await FakeDevice.connect(second.token)
    await secondDevice.waitFor(ServerEvent.SESSION_READY)

    await db().from('sms_messages').where('uid', uid).update({ next_attempt_at: null })
    await SmsDispatcher.dispatchBatch()
    await secondDevice.waitFor(ServerEvent.SMS_SEND)

    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    await device.waitFor(ServerEvent.RESULT_ACK)

    const cancel = await secondDevice.waitFor(ServerEvent.SMS_CANCEL)
    assert.equal((cancel.data as { jobId: string }).jobId, uid)

    await device.close()
    await secondDevice.close()

    const message = await messageOf(uid)
    assert.equal(message.status, SmsStatus.SENT)

    const attempts = await SmsAttempt.query()
      .where('sms_message_id', String(message.id))
      .orderBy('attempt_no', 'asc')
    assert.equal(attempts[0].status, SmsAttemptStatus.SENT)
    assert.equal(attempts[1].status, SmsAttemptStatus.FAILED)
    assert.equal(attempts[1].errorCode, ErrorCode.SUPERSEDED)

    const superseded = await db()
      .from('sms_events')
      .where('sms_message_id', String(message.id))
      .where('event', SmsEvent.SUPERSEDED)
    assert.lengthOf(superseded, 1)
  })

  /**
   * What the radio said ends up on the message's timeline, so the panel can
   * show what used to be visible only in the phone's own log.
   */
  test('the platform and radio codes of a failure are kept', async ({ client, assert }) => {
    const { device, uid } = await dispatched(client)

    device.send(ClientEvent.SMS_RESULT, {
      jobId: uid,
      status: 'failed',
      errorCode: ErrorCode.RADIO_OFF,
      errorMessage: 'The radio is switched off',
      platformResult: 2,
      radioErrorCode: 38,
    })
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await messageOf(uid)
    const event = await db()
      .from('sms_events')
      .where('sms_message_id', String(message.id))
      .where('event', SmsEvent.FAILED)
      .first()

    assert.equal(event.payload.platformResult, 2)
    assert.equal(event.payload.radioErrorCode, 38)

    const attempt = await SmsAttempt.query().where('sms_message_id', String(message.id)).first()
    assert.include(attempt!.errorMessage!, 'radio 38')
  })

  test('a repeated delivery report changes nothing', async ({ client, assert }) => {
    const { device, uid } = await dispatched(client)

    for (let index = 0; index < 3; index++) {
      device.send(ClientEvent.SMS_DELIVERED, { jobId: uid, status: 'delivered' })
      await device.waitFor(ServerEvent.RESULT_ACK)
    }
    await device.close()

    const message = await messageOf(uid)
    const delivered = await db()
      .from('sms_events')
      .where('sms_message_id', String(message.id))
      .where('event', SmsEvent.DELIVERED)

    assert.equal(message.status, SmsStatus.DELIVERED)
    assert.lengthOf(delivered, 1)
  })

  /**
   * A send result whose acknowledgement was lost is resent after the phone
   * reconnects. By then the delivery report may already have failed the
   * message, and the resend must not undo that.
   */
  test('a resent send result does not undo a failed delivery', async ({ client, assert }) => {
    const { device, uid } = await dispatched(client)

    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    await device.waitFor(ServerEvent.RESULT_ACK)
    device.send(ClientEvent.SMS_DELIVERED, { jobId: uid, status: 'failed', statusCode: 64 })
    await device.waitFor(ServerEvent.RESULT_ACK)

    device.send(ClientEvent.SMS_RESULT, { jobId: uid, status: 'sent' })
    await device.waitFor(ServerEvent.RESULT_ACK)
    await device.close()

    const message = await messageOf(uid)
    assert.equal(message.status, SmsStatus.FAILED)
    assert.equal(message.errorCode, ErrorCode.DELIVERY_FAILED)
  })
})
