import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { createTestClient, collectionOf, itemOf } from '#tests/helpers'
import { createApprovedGateway, createPlatformOperator } from '#tests/gateway_helpers'
import { db } from '#tests/db'
import SmsService from '#services/sms/sms_service'
import SimProfile from '#models/sim_profile'
import JobQueue from '#services/infra/job_queue'
import { JobQueueName, JobStatus } from '#enums/job'
import { SmsStatus } from '#enums/sms_status'
import { ErrorCode } from '#enums/error_code'

test.group('admin claim codes', () => {
  /**
   * The case this exists for: a phone was approved, nobody typed the code in
   * within its half hour, and the device now sits there permanently unable to
   * connect. Approval did not expire — the code did.
   */
  test('issues a fresh code for an already approved device', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const { gateway } = await createApprovedGateway()

    await db()
      .from('gateways')
      .where('id', gateway.id)
      .update({ claim_code_expires_at: DateTime.now().minus({ hours: 2 }).toSQL() })

    const response = await client
      .post(`/api/v1/admin/gateways/${gateway.uid}/claim-code`)
      .header('authorization', bearer)

    response.assertStatus(200)

    const claimCode = (response.body() as unknown as { data: { claimCode: string } }).data.claimCode

    const claimed = await client
      .post('/api/v1/gw/claim')
      .json({ deviceId: gateway.deviceId, claimCode })

    claimed.assertStatus(200)
    assert.isString(
      (claimed.body() as unknown as { data: { accessToken: string } }).data.accessToken
    )
  })

  /**
   * Safe to press twice: issuing invalidates whatever came before, so a
   * second code cannot leave two valid ones in the wild.
   */
  test('a new code voids the previous one', async ({ client }) => {
    const { bearer } = await createPlatformOperator()
    const { gateway } = await createApprovedGateway()

    const first = await client
      .post(`/api/v1/admin/gateways/${gateway.uid}/claim-code`)
      .header('authorization', bearer)

    await client
      .post(`/api/v1/admin/gateways/${gateway.uid}/claim-code`)
      .header('authorization', bearer)

    const stale = (first.body() as unknown as { data: { claimCode: string } }).data.claimCode

    const claimed = await client
      .post('/api/v1/gw/claim')
      .json({ deviceId: gateway.deviceId, claimCode: stale })

    claimed.assertStatus(403)
  })
})

test.group('admin SIM settings', () => {
  test('changes pacing and quota', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const { simProfile } = await createApprovedGateway()

    const response = await client
      .patch(`/api/v1/admin/sims/${simProfile.uid}`)
      .header('authorization', bearer)
      .json({ label: 'Beeline main', smsPerMinute: 12, dailyQuota: 400 })

    response.assertStatus(200)
    assert.equal(itemOf(response).label, 'Beeline main')
    assert.equal(itemOf(response).smsPerMinute, 12)
    assert.equal(itemOf(response).dailyQuota, 400)
  })

  /**
   * Re-arming USSD has to clear the streak too, or the scheduler gives up
   * again on the next single failure — which is not what "try again" means.
   */
  test('re-arming USSD clears the failure streak', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const { simProfile } = await createApprovedGateway()

    await db()
      .from('sim_profiles')
      .where('id', simProfile.id)
      .update({ ussd_supported: false, balance_failures: 5 })

    const response = await client
      .patch(`/api/v1/admin/sims/${simProfile.uid}`)
      .header('authorization', bearer)
      .json({ ussdSupported: true })

    response.assertStatus(200)

    const sim = await SimProfile.find(simProfile.id)
    assert.isTrue(sim!.ussdSupported)
    assert.equal(sim!.balanceFailures, 0)
  })

  /**
   * `state` is the phone's report of whether the card is readable. A panel
   * that could overwrite it would let someone mark a missing SIM as ready and
   * watch every message routed to it fail.
   */
  test('refuses to overwrite what the device reports', async ({ client }) => {
    const { bearer } = await createPlatformOperator()
    const { simProfile } = await createApprovedGateway()

    const response = await client
      .patch(`/api/v1/admin/sims/${simProfile.uid}`)
      .header('authorization', bearer)
      /**
       * `ussdSupported: false` is refused for the same reason: only the device
       * may turn it off, by saying it cannot run USSD at all.
       */
      .json({ state: 'ready', ussdSupported: false } as Record<string, unknown>)

    response.assertStatus(422)
  })
})

test.group('admin diagnostics', () => {
  test('returns the device history in one read', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const { gateway } = await createApprovedGateway()

    const response = await client
      .get(`/api/v1/admin/gateways/${gateway.uid}/diagnostics`)
      .header('authorization', bearer)

    response.assertStatus(200)

    const body = (
      response.body() as unknown as {
        data: { events: { event: string }[]; sessions: unknown[]; ussd: unknown[] }
      }
    ).data

    /**
     * Approval is itself an event, so a freshly enrolled device already has a
     * history worth showing.
     */
    assert.includeMembers(
      body.events.map((event) => event.event),
      ['approved']
    )
    assert.isArray(body.sessions)
    assert.isArray(body.ussd)
  })
})

test.group('admin message actions', () => {
  test('cancels a queued message on a tenant behalf', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    const { message } = await SmsService.send(tenant.tenant, null, {
      to: '901234567',
      message: 'kod',
    })

    const response = await client
      .post(`/api/v1/admin/messages/${message.uid}/cancel`)
      .header('authorization', bearer)

    response.assertStatus(200)
    assert.equal(itemOf(response).status, SmsStatus.CANCELLED)
  })

  /**
   * Nothing can be recalled from a phone, so a message already handed over is
   * refused here exactly as it would be on the tenant API.
   */
  test('refuses a message that is already with a device', async ({ client }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    const { message } = await SmsService.send(tenant.tenant, null, {
      to: '901234567',
      message: 'kod',
    })

    await db().from('sms_messages').where('uid', message.uid).update({ status: SmsStatus.SENDING })

    const response = await client
      .post(`/api/v1/admin/messages/${message.uid}/cancel`)
      .header('authorization', bearer)

    response.assertStatus(409)
    response.assertBodyContains({ error: { code: ErrorCode.FORBIDDEN } })
  })

  test('shows which device each attempt went through', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    const { message } = await SmsService.send(tenant.tenant, null, {
      to: '901234567',
      message: 'kod',
    })

    const response = await client
      .get(`/api/v1/admin/messages/${message.uid}`)
      .header('authorization', bearer)

    const body = (response.body() as unknown as { data: { attempts: unknown[] } }).data

    /**
     * Nothing has been dispatched yet, so the list is empty rather than
     * missing: the shape does not change once it has been.
     */
    assert.isArray(body.attempts)
  })
})

test.group('admin jobs', () => {
  test('lists failed deliveries and retries them', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()

    await JobQueue.enqueue(JobQueueName.WEBHOOK_DELIVERY, { endpointUid: 'whk_x' })
    await db().from('jobs').update({ status: JobStatus.FAILED, attempts: 5, last_error: 'gone' })

    const listed = await client
      .get('/api/v1/admin/jobs')
      .qs({ status: 'failed' })
      .header('authorization', bearer)

    listed.assertStatus(200)
    assert.lengthOf(collectionOf(listed), 1)
    assert.equal(collectionOf(listed)[0].lastError, 'gone')

    const id = collectionOf(listed)[0].id

    const retried = await client
      .post(`/api/v1/admin/jobs/${id}/retry`)
      .header('authorization', bearer)

    retried.assertStatus(204)

    const row = await db().from('jobs').where('id', id).first()

    assert.equal(row.status, JobStatus.PENDING)

    /**
     * Counted from zero again: a job retried by hand is retried because the
     * reason it failed was fixed, and continuing the backoff would put the
     * first attempt an hour away.
     */
    assert.equal(Number(row.attempts), 0)
  })

  test('refuses to retry a job that is not failed', async ({ client }) => {
    const { bearer } = await createPlatformOperator()

    await JobQueue.enqueue(JobQueueName.WEBHOOK_DELIVERY, { endpointUid: 'whk_x' })
    const row = await db().from('jobs').first()

    const response = await client
      .post(`/api/v1/admin/jobs/${row.id}/retry`)
      .header('authorization', bearer)

    response.assertStatus(404)
  })
})
