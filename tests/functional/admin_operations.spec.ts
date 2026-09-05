import { randomBytes } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { createTestClient, collectionOf, itemOf } from '#tests/helpers'
import { createApprovedGateway, createPlatformOperator } from '#tests/gateway_helpers'
import { db } from '#tests/db'
import SmsStatsService from '#services/reports/sms_stats_service'
import WebhookEndpoint from '#models/webhook_endpoint'
import User from '#models/user'
import { SmsStatus } from '#enums/sms_status'

/**
 * Puts settled messages in the past, which the API deliberately cannot do: a
 * report about closed days needs closed days.
 */
async function seedDay(tenantId: number, day: DateTime, statuses: string[]) {
  for (const status of statuses) {
    await db()
      .table('sms_messages')
      .insert({
        /**
         * Random rather than sequential: two tenants seeded in the same test
         * would otherwise collide on the uid.
         */
        uid: `sms_${randomBytes(11).toString('hex').toUpperCase()}`,
        tenant_id: tenantId,
        recipient: '901234567',
        recipient_normalized: '+998901234567',
        body_hash: 'hash',
        segments: 1,
        encoding: 'gsm7',
        status,
        priority: 5,
        attempts: 1,
        max_attempts: 3,
        queued_at: day.plus({ hours: 9 }).toSQL(),
        sent_at: status === SmsStatus.SENT ? day.plus({ hours: 9, seconds: 3 }).toSQL() : null,
        created_at: day.plus({ hours: 9 }).toSQL(),
        updated_at: day.plus({ hours: 9 }).toSQL(),
      })
  }
}

test.group('admin reports', () => {
  test('reports the whole platform by default', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const first = await createTestClient()
    const second = await createTestClient()

    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')
    await seedDay(first.tenant.id, yesterday, [SmsStatus.SENT, SmsStatus.SENT])
    await seedDay(second.tenant.id, yesterday, [SmsStatus.SENT, SmsStatus.FAILED])
    await SmsStatsService.rollup(yesterday)

    const response = await client.get('/api/v1/admin/reports/daily').header('authorization', bearer)

    response.assertStatus(200)

    const rows = collectionOf(response)
    const row = rows.find((entry) => entry.date === yesterday.toISODate())!

    assert.equal(row.total, 4)
    assert.equal(row.sent, 3)
    assert.equal(row.failed, 1)
    assert.equal(response.body().meta.successRate, 75)
    assert.isFalse(response.body().meta.tenantScoped)
  })

  test('narrows to one tenant', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const first = await createTestClient()
    const second = await createTestClient()

    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')
    await seedDay(first.tenant.id, yesterday, [SmsStatus.SENT, SmsStatus.SENT])
    await seedDay(second.tenant.id, yesterday, [SmsStatus.SENT])
    await SmsStatsService.rollup(yesterday)

    const response = await client
      .get('/api/v1/admin/reports/daily')
      .qs({ tenant: first.tenant.uid })
      .header('authorization', bearer)

    const row = collectionOf(response).find((entry) => entry.date === yesterday.toISODate())!

    assert.equal(row.total, 2)
    assert.isTrue(response.body().meta.tenantScoped)
  })

  /**
   * Reading the platform's totals while believing they are one tenant's would
   * be worse than an error.
   */
  test('refuses an unknown tenant rather than answering platform-wide', async ({ client }) => {
    const { bearer } = await createPlatformOperator()

    const response = await client
      .get('/api/v1/admin/reports/daily')
      .qs({ tenant: 'ten_00000000000000000000000' })
      .header('authorization', bearer)

    response.assertStatus(404)
  })
})

test.group('admin fleet settings', () => {
  test('changes the routing knobs an operator owns', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const { gateway } = await createApprovedGateway()

    const response = await client
      .patch(`/api/v1/admin/gateways/${gateway.uid}`)
      .header('authorization', bearer)
      .json({ name: 'Warehouse phone', priority: 2, maxInFlight: 4 })

    response.assertStatus(200)
    assert.equal(itemOf(response).name, 'Warehouse phone')
    assert.equal(itemOf(response).priority, 2)
    assert.equal(itemOf(response).maxInFlight, 4)
  })

  /**
   * Raising concurrency past what a phone can sustain turns latency into
   * timeouts, so the bound is enforced rather than trusted.
   */
  test('refuses an unreasonable concurrency', async ({ client }) => {
    const { bearer } = await createPlatformOperator()
    const { gateway } = await createApprovedGateway()

    const response = await client
      .patch(`/api/v1/admin/gateways/${gateway.uid}`)
      .header('authorization', bearer)
      .json({ maxInFlight: 500 })

    response.assertStatus(422)
  })
})

test.group('admin fleet recovery', () => {
  /**
   * The reason enabling is its own action: disabling revoked the phone's
   * token, so a device flipped back to active with no credential would look
   * healthy and never connect.
   */
  test('re-enabling a device issues a fresh claim code', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const { gateway } = await createApprovedGateway()

    await client
      .post(`/api/v1/admin/gateways/${gateway.uid}/disable`)
      .header('authorization', bearer)
      .then((response) => response.assertStatus(200))

    const enabled = await client
      .post(`/api/v1/admin/gateways/${gateway.uid}/enable`)
      .header('authorization', bearer)

    enabled.assertStatus(200)

    const body = (
      enabled.body() as unknown as {
        data: { gateway: { status: string; isActive: boolean }; claimCode: string }
      }
    ).data

    assert.isTrue(body.gateway.isActive)

    /**
     * Offline, not online: it is allowed back, but nothing has heard from it
     * yet and claiming otherwise would put it straight into routing.
     */
    assert.equal(body.gateway.status, 'offline')
    assert.isAtLeast(body.claimCode.length, 16)

    /**
     * The code has to actually work, or the recovery is theatre.
     */
    const claimed = await client
      .post('/api/v1/gw/claim')
      .json({ deviceId: gateway.deviceId, claimCode: body.claimCode })

    claimed.assertStatus(200)
  })
})

test.group('admin staff', () => {
  test('creates an operator that can sign in', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()

    const created = await client
      .post('/api/v1/admin/staff')
      .header('authorization', bearer)
      .json({ email: 'second@example.com', password: 'a-good-password', fullName: 'Second Ops' })

    created.assertStatus(201)

    const login = await client
      .post('/api/v1/auth/login')
      .json({ email: 'second@example.com', password: 'a-good-password' })

    login.assertStatus(200)

    /**
     * The new account is staff, so it reaches the back office rather than
     * authenticating into nothing.
     */
    const token = (login.body() as unknown as { data: { token: string } }).data.token
    const overview = await client
      .get('/api/v1/admin/overview')
      .header('authorization', `Bearer ${token}`)

    overview.assertStatus(200)
    assert.isObject(itemOf(overview).queue)
  })

  test('refuses a duplicate email', async ({ client }) => {
    const { bearer, user } = await createPlatformOperator()

    const response = await client
      .post('/api/v1/admin/staff')
      .header('authorization', bearer)
      .json({ email: user.email, password: 'a-good-password' })

    response.assertStatus(422)
  })

  /**
   * Disabling has to end the session now: the guard checks `isActive`, but a
   * revoked account should not be one check away from working again.
   */
  test('disabling an operator revokes its tokens', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const other = await createPlatformOperator()

    const listed = await client.get('/api/v1/admin/staff').header('authorization', bearer)
    const target = collectionOf(listed).find((row) => row.email === other.user.email)!

    const disabled = await client
      .patch(`/api/v1/admin/staff/${target.uid}`)
      .header('authorization', bearer)
      .json({ isActive: false })

    disabled.assertStatus(200)

    const after = await client.get('/api/v1/admin/overview').header('authorization', other.bearer)

    after.assertStatus(401)

    const tokens = await User.accessTokens.all(other.user)
    assert.lengthOf(tokens, 0)
  })

  /**
   * On a small team there may be nobody else to undo it.
   */
  test('refuses to let an operator disable themselves', async ({ client }) => {
    const { bearer, user } = await createPlatformOperator()

    const response = await client
      .patch(`/api/v1/admin/staff/${user.uid}`)
      .header('authorization', bearer)
      .json({ isActive: false })

    response.assertStatus(422)
  })

  /**
   * A tenant's own users are not staff and must not appear in the list an
   * operator uses to decide who has access.
   */
  test('lists only platform operators', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    await User.create({
      fullName: 'Tenant Person',
      email: `tenant-person-${Date.now()}@example.com`,
      password: 'a-good-password',
      tenantId: tenant.tenant.id,
      isActive: true,
      createdAt: DateTime.now(),
    })

    const response = await client.get('/api/v1/admin/staff').header('authorization', bearer)

    assert.notInclude(
      collectionOf(response).map((row) => row.fullName),
      'Tenant Person'
    )
  })
})

test.group('admin webhook view', () => {
  test('shows a tenant endpoints without their secrets', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    await WebhookEndpoint.create({
      tenantId: tenant.tenant.id,
      url: 'https://example.test/hooks',
      secret: 'whsec_test',
      events: [],
      isActive: true,
      failureCount: 3,
    })

    const response = await client
      .get(`/api/v1/admin/tenants/${tenant.tenant.uid}/webhooks`)
      .header('authorization', bearer)

    response.assertStatus(200)

    const rows = collectionOf(response)
    assert.lengthOf(rows, 1)

    /**
     * The failure counter is what support is here for; the signing secret is
     * not theirs to read.
     */
    assert.equal(rows[0].failureCount, 3)
    assert.isUndefined(rows[0].secret)
  })
})
