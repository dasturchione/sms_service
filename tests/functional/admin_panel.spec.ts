import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { createTestClient, collectionOf, itemOf } from '#tests/helpers'
import { createApprovedGateway, createPlatformOperator } from '#tests/gateway_helpers'
import { db } from '#tests/db'
import User from '#models/user'
import SmsService from '#services/sms/sms_service'
import { ClientAbility } from '#enums/ability'
import { TenantStatus, UserRole } from '#enums/tenant'
import { SmsStatus } from '#enums/sms_status'

/**
 * A tenant administrator: a user that belongs to a tenant. Being staff is
 * defined by *not* having one, so this is the account that must be refused.
 */
async function createTenantAdmin(tenantId: number): Promise<string> {
  const user = await User.create({
    fullName: 'Tenant Admin',
    email: `admin-${tenantId}-${Date.now()}@example.com`,
    password: 'secret-password',
    tenantId,
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: DateTime.now(),
  })

  const token = await User.accessTokens.create(user)

  return `Bearer ${token.value!.release()}`
}

test.group('admin access', () => {
  test('refuses a tenant administrator', async ({ client }) => {
    const { tenant } = await createTestClient()
    const bearer = await createTenantAdmin(tenant.id)

    const response = await client.get('/api/v1/admin/tenants').header('authorization', bearer)

    response.assertStatus(403)
  })

  test('refuses an unauthenticated request', async ({ client }) => {
    const response = await client.get('/api/v1/admin/overview')

    response.assertStatus(401)
  })

  /**
   * A disabled account keeps its token until it expires, so the guard has to
   * check the account rather than only the credential.
   */
  test('refuses a disabled operator', async ({ client }) => {
    const { user, bearer } = await createPlatformOperator()

    await db().from('users').where('id', user.id).update({ is_active: false })

    const response = await client.get('/api/v1/admin/overview').header('authorization', bearer)

    response.assertStatus(403)
  })
})

test.group('admin tenants', () => {
  test('creates a tenant and issues credentials once', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()

    const created = await client
      .post('/api/v1/admin/tenants')
      .header('authorization', bearer)
      .json({ name: 'Acme Bank', settings: { lowBalanceThreshold: 250 } })

    created.assertStatus(201)
    assert.equal(itemOf(created).slug, 'acme-bank')
    assert.equal(itemOf(created).settings.lowBalanceThreshold, 250)

    const uid = itemOf(created).uid

    const issued = await client
      .post(`/api/v1/admin/tenants/${uid}/clients`)
      .header('authorization', bearer)
      .json({ name: 'production', abilities: [ClientAbility.SMS_SEND], rateLimitPerMin: 120 })

    issued.assertStatus(201)

    const secret = (issued.body() as unknown as { clientSecret: string }).clientSecret
    assert.isAtLeast(secret.length, 32)

    /**
     * The secret exists exactly once, in the response that created it.
     */
    const read = await client
      .get(`/api/v1/admin/tenants/${uid}/clients`)
      .header('authorization', bearer)

    assert.isUndefined(collectionOf(read)[0].clientSecret)
    assert.equal(collectionOf(read)[0].rateLimitPerMin, 120)
  })

  test('refuses a duplicate slug', async ({ client }) => {
    const { bearer } = await createPlatformOperator()

    await client
      .post('/api/v1/admin/tenants')
      .header('authorization', bearer)
      .json({ name: 'Acme Bank' })

    const response = await client
      .post('/api/v1/admin/tenants')
      .header('authorization', bearer)
      .json({ name: 'Acme Bank' })

    response.assertStatus(422)
  })

  /**
   * The panel edits one knob at a time; a PATCH that reset the others would be
   * a trap.
   */
  test('merges settings rather than replacing them', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()

    const created = await client
      .post('/api/v1/admin/tenants')
      .header('authorization', bearer)
      .json({ name: 'Acme Bank', settings: { lowBalanceThreshold: 250, defaultMaxAttempts: 5 } })

    const updated = await client
      .patch(`/api/v1/admin/tenants/${itemOf(created).uid}`)
      .header('authorization', bearer)
      .json({ status: TenantStatus.SUSPENDED, settings: { lowBalanceThreshold: 900 } })

    updated.assertStatus(200)
    assert.equal(itemOf(updated).status, TenantStatus.SUSPENDED)
    assert.equal(itemOf(updated).settings.lowBalanceThreshold, 900)
    assert.equal(itemOf(updated).settings.defaultMaxAttempts, 5)
  })

  /**
   * "Disable" has to mean the credential stops working now, not when its
   * tokens happen to expire.
   */
  test('disabling a client revokes its live tokens', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const sendBefore = await client
      .post('/api/v1/sms')
      .header('authorization', tenant.bearer)
      .json({ to: '901234567', message: 'kod' })

    sendBefore.assertStatus(202)

    const disabled = await client
      .patch(`/api/v1/admin/tenants/${tenant.tenant.uid}/clients/${tenant.client.uid}`)
      .header('authorization', bearer)
      .json({ isActive: false })

    disabled.assertStatus(200)
    assert.isFalse(itemOf(disabled).isActive)

    const sendAfter = await client
      .post('/api/v1/sms')
      .header('authorization', tenant.bearer)
      .json({ to: '901234567', message: 'kod' })

    sendAfter.assertStatus(401)
  })

  /**
   * A leaked secret: the new one works, the old one does not, and neither
   * does any token already exchanged for the old one.
   */
  test('rotating a secret replaces it and revokes live tokens', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient({ abilities: [ClientAbility.SMS_SEND] })

    const rotated = await client
      .post(`/api/v1/admin/tenants/${tenant.tenant.uid}/clients/${tenant.client.uid}/rotate-secret`)
      .header('authorization', bearer)

    rotated.assertStatus(200)
    const body = rotated.body() as unknown as { clientSecret: string; data: { uid: string } }
    assert.equal(body.data.uid, tenant.client.uid)
    assert.notEqual(body.clientSecret, tenant.secret)

    const oldToken = await client
      .post('/api/v1/sms')
      .header('authorization', tenant.bearer)
      .json({ to: '901234567', message: 'kod' })
    oldToken.assertStatus(401)

    const oldSecret = await client
      .post('/api/v1/auth/token')
      .json({ clientId: tenant.client.clientId, clientSecret: tenant.secret })
    oldSecret.assertStatus(401)

    const newSecret = await client
      .post('/api/v1/auth/token')
      .json({ clientId: tenant.client.clientId, clientSecret: body.clientSecret })
    newSecret.assertStatus(200)
  })
})

test.group('admin explorer', () => {
  test('searches messages across tenants and says whose they are', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const first = await createTestClient({ name: 'first-tenant' })
    const second = await createTestClient({ name: 'second-tenant' })

    await SmsService.send(first.tenant, null, { to: '901234567', message: 'bir' })
    await SmsService.send(second.tenant, null, { to: '931234567', message: 'ikki' })

    const all = await client.get('/api/v1/admin/messages').header('authorization', bearer)

    all.assertStatus(200)
    assert.lengthOf(collectionOf(all), 2)
    assert.includeMembers(
      collectionOf(all).map((row) => row.tenant),
      ['first-tenant', 'second-tenant']
    )

    const filtered = await client
      .get('/api/v1/admin/messages')
      .qs({ tenant: first.tenant.uid })
      .header('authorization', bearer)

    assert.lengthOf(collectionOf(filtered), 1)
  })

  /**
   * Support gets a number in whatever shape the person on the phone read it
   * out, so the search normalises before matching.
   */
  test('finds a message by a loosely typed number', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    await SmsService.send(tenant.tenant, null, { to: '901234567', message: 'kod' })

    for (const typed of ['901234567', '+998901234567', '998 90 123 45 67']) {
      const response = await client
        .get('/api/v1/admin/messages')
        .qs({ recipient: typed })
        .header('authorization', bearer)

      assert.lengthOf(collectionOf(response), 1, `failed for "${typed}"`)
    }
  })

  test('returns a message with its timeline', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    const { message } = await SmsService.send(tenant.tenant, null, {
      to: '901234567',
      message: 'kod',
    })

    const response = await client
      .get(`/api/v1/admin/messages/${message.uid}`)
      .header('authorization', bearer)

    response.assertStatus(200)

    const body = (
      response.body() as unknown as {
        data: { message: { status: string }; events: { event: string }[] }
      }
    ).data

    assert.equal(body.message.status, SmsStatus.QUEUED)
    assert.deepEqual(
      body.events.map((event) => event.event),
      ['created', 'queued']
    )
  })

  test('pages through messages with a stable cursor', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    for (let index = 0; index < 5; index++) {
      await SmsService.send(tenant.tenant, null, { to: '901234567', message: `kod ${index}` })
    }

    const first = await client
      .get('/api/v1/admin/messages')
      .qs({ limit: 2 })
      .header('authorization', bearer)

    assert.lengthOf(collectionOf(first), 2)

    const cursor = first.body().meta.nextCursor as string
    assert.isNotNull(cursor)

    const second = await client
      .get('/api/v1/admin/messages')
      .qs({ limit: 2, cursor })
      .header('authorization', bearer)

    const firstUids = collectionOf(first).map((row) => row.uid)
    const secondUids = collectionOf(second).map((row) => row.uid)

    assert.notIncludeMembers(secondUids, firstUids)
  })

  test('reads the audit trail', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()

    await client
      .post('/api/v1/admin/tenants')
      .header('authorization', bearer)
      .json({ name: 'Acme Bank' })

    const response = await client
      .get('/api/v1/admin/audit')
      .qs({ action: 'tenant.created' })
      .header('authorization', bearer)

    response.assertStatus(200)
    assert.lengthOf(collectionOf(response), 1)
    assert.equal(collectionOf(response)[0].actor.type, 'user')
  })
})

test.group('admin overview', () => {
  test('answers every tile in one request', async ({ client, assert }) => {
    const { bearer } = await createPlatformOperator()
    const tenant = await createTestClient()

    await createApprovedGateway()
    await SmsService.send(tenant.tenant, null, { to: '901234567', message: 'kod' })

    const response = await client.get('/api/v1/admin/overview').header('authorization', bearer)

    response.assertStatus(200)

    const body = itemOf(response)
    assert.equal(body.queue.depth, 1)
    assert.equal(body.today.total, 1)
    assert.equal(body.tenants.active, 1)
    assert.equal(body.gateways.online, 0)
    assert.isString(body.generatedAt)

    /**
     * Nothing has settled yet, so a success rate would be a made up number.
     */
    assert.isNull(body.today.successRate)
  })
})

/**
 * There is no self-signup. An account here can approve gateways and issue
 * credentials that spend money on the platform's SIMs, so it is handed out by
 * an existing operator rather than claimed by whoever reaches the URL — which
 * matters most when the API is exposed through a tunnel or a staging host.
 */
test.group('staff accounts', () => {
  test('posting to the old signup path creates nothing', async ({ client, assert }) => {
    const before = await db().from('users').count('* as total').first()

    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Stranger',
      email: 'stranger@example.com',
      password: 'a-long-enough-password',
      passwordConfirmation: 'a-long-enough-password',
    })

    assert.isAbove(response.status(), 399)

    const after = await db().from('users').count('* as total').first()
    assert.equal(Number(after!.total), Number(before!.total))
  })

  test('an operator creates another operator, who can then sign in', async ({ client, assert }) => {
    const operator = await createPlatformOperator()

    const created = await client
      .post('/api/v1/admin/staff')
      .header('authorization', operator.bearer)
      .json({
        fullName: 'Second Operator',
        email: 'second@example.com',
        password: 'a-long-enough-password',
        role: UserRole.ADMIN,
      })

    created.assertStatus(201)

    const signedIn = await client.post('/api/v1/auth/login').json({
      email: 'second@example.com',
      password: 'a-long-enough-password',
    })

    signedIn.assertStatus(200)

    /**
     * The new account is staff, not a tenant administrator: the absence of a
     * tenant is what grants back office access, so it has to be absent.
     */
    const row = await db().from('users').where('email', 'second@example.com').first()
    assert.isNull(row.tenant_id)

    const reachable = await client
      .get('/api/v1/admin/overview')
      .header('authorization', `Bearer ${itemOf<{ token: string }>(signedIn).token}`)

    reachable.assertStatus(200)
  })

  test('a tenant administrator cannot create an operator', async ({ client }) => {
    const { tenant } = await createTestClient()
    const bearer = await createTenantAdmin(tenant.id)

    const response = await client
      .post('/api/v1/admin/staff')
      .header('authorization', bearer)
      .json({ email: 'escalate@example.com', password: 'a-long-enough-password' })

    response.assertStatus(403)
  })
})
