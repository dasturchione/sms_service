import { test } from '@japa/runner'
import { createTestClient } from '#tests/helpers'
import { createApprovedGateway } from '#tests/gateway_helpers'
import { db } from '#tests/db'
import AlertService from '#services/infra/alert_service'
import GatewayPresenceService from '#services/gateway/gateway_presence_service'
import WebhookEndpoint from '#models/webhook_endpoint'
import { WebhookEvent } from '#enums/webhook_event'
import { JobQueueName } from '#enums/job'
import { GatewayStatus } from '#enums/gateway_status'

async function subscribe(tenantId: number, events: WebhookEvent[] = []) {
  await WebhookEndpoint.create({
    tenantId,
    url: 'https://example.test/hooks',
    secret: 'whsec_test',
    events,
    isActive: true,
    failureCount: 0,
  })
}

async function queuedEvents(): Promise<string[]> {
  const jobs = await db()
    .from('jobs')
    .where('queue', JobQueueName.WEBHOOK_DELIVERY)
    .select('payload')

  return (jobs as Record<string, any>[]).map((job) => job.payload.event)
}

test.group('alerts', () => {
  test('warns the owning tenant when a SIM runs low', async ({ assert }) => {
    const { tenant } = await createTestClient({ settings: { lowBalanceThreshold: 100 } })
    await subscribe(tenant.id)

    const { simProfile } = await createApprovedGateway({ tenantId: tenant.id })
    await db().from('sim_profiles').where('id', simProfile.id).update({ sms_balance: 42 })

    assert.equal(await AlertService.sweepLowBalances(), 1)
    assert.deepEqual(await queuedEvents(), [WebhookEvent.BALANCE_LOW])
  })

  test('says nothing about a SIM that is still above the threshold', async ({ assert }) => {
    const { tenant } = await createTestClient({ settings: { lowBalanceThreshold: 100 } })
    await subscribe(tenant.id)

    const { simProfile } = await createApprovedGateway({ tenantId: tenant.id })
    await db().from('sim_profiles').where('id', simProfile.id).update({ sms_balance: 500 })

    assert.equal(await AlertService.sweepLowBalances(), 0)
    assert.isEmpty(await queuedEvents())
  })

  /**
   * A balance that has never been read is unknown, not zero. Treating it as
   * zero would alert about every SIM on the platform until M5 lands.
   */
  test('ignores a SIM whose balance has never been read', async ({ assert }) => {
    const { tenant } = await createTestClient()
    await subscribe(tenant.id)
    await createApprovedGateway({ tenantId: tenant.id })

    assert.equal(await AlertService.sweepLowBalances(), 0)
  })

  /**
   * The same SIM stays low for hours; the tenant should hear about it once.
   */
  test('does not repeat a low balance alert on the same day', async ({ assert }) => {
    const { tenant } = await createTestClient({ settings: { lowBalanceThreshold: 100 } })
    await subscribe(tenant.id)

    const { simProfile } = await createApprovedGateway({ tenantId: tenant.id })
    await db().from('sim_profiles').where('id', simProfile.id).update({ sms_balance: 10 })

    await AlertService.sweepLowBalances()
    await AlertService.sweepLowBalances()

    assert.lengthOf(await queuedEvents(), 1)
  })

  test('tells a tenant when its own device goes quiet', async ({ assert }) => {
    const { tenant } = await createTestClient()
    await subscribe(tenant.id)

    const { gateway } = await createApprovedGateway({ tenantId: tenant.id })

    await db()
      .from('gateways')
      .where('id', gateway.id)
      .update({ status: GatewayStatus.ONLINE, last_seen_at: null })

    const stale = await GatewayPresenceService.markStaleGatewaysOffline()
    assert.lengthOf(stale, 1)

    for (const offline of stale) await AlertService.gatewayOffline(offline)

    assert.deepEqual(await queuedEvents(), [WebhookEvent.GATEWAY_OFFLINE])
  })

  /**
   * A shared pool device is the platform's problem: no tenant owns it, and the
   * tenants using it should see routing continue rather than an alarm they
   * cannot act on.
   */
  test('does not alert a tenant about a shared pool device', async ({ assert }) => {
    const { tenant } = await createTestClient()
    await subscribe(tenant.id)

    const { gateway } = await createApprovedGateway({ tenantId: null })

    await db()
      .from('gateways')
      .where('id', gateway.id)
      .update({ status: GatewayStatus.ONLINE, last_seen_at: null })

    for (const offline of await GatewayPresenceService.markStaleGatewaysOffline()) {
      await AlertService.gatewayOffline(offline)
    }

    assert.isEmpty(await queuedEvents())
  })
})
