import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import Tenant from '#models/tenant'
import ApiClient from '#models/api_client'
import { DEFAULT_CLIENT_ABILITIES, type ClientAbility } from '#enums/ability'
import { TenantStatus } from '#enums/tenant'
import type { TenantSettings } from '#enums/tenant'

export type TestClient = {
  tenant: Tenant
  client: ApiClient
  /** Plain secret, for exercising the token endpoint. */
  secret: string
  /** Ready to use `Authorization` header value. */
  bearer: string
}

/**
 * Provisions a tenant with working credentials.
 *
 * Tests get a real token through the real issuing path rather than a stub, so
 * an ability or expiry regression shows up in the tests that use it.
 */
export async function createTestClient(
  options: {
    name?: string
    abilities?: ClientAbility[]
    status?: TenantStatus
    settings?: TenantSettings
    isActive?: boolean
  } = {}
): Promise<TestClient> {
  const name = options.name ?? `tenant-${randomBytes(4).toString('hex')}`

  const tenant = await Tenant.create({
    name,
    slug: name,
    status: options.status ?? TenantStatus.ACTIVE,
    settings: options.settings ?? {},
    createdAt: DateTime.now(),
  })

  const secret = randomBytes(24).toString('base64url')
  const abilities = options.abilities ?? [...DEFAULT_CLIENT_ABILITIES]

  const client = await ApiClient.create({
    tenantId: tenant.id,
    name: 'test',
    clientId: `cid_${randomBytes(12).toString('hex')}`,
    clientSecretHash: await hash.make(secret),
    abilities,
    rateLimitPerMin: 600,
    isActive: options.isActive ?? true,
    createdAt: DateTime.now(),
  })

  const token = await ApiClient.accessTokens.create(client, abilities)

  return { tenant, client, secret, bearer: `Bearer ${token.value!.release()}` }
}

/**
 * The typed route registry describes `data` as "item or collection", since a
 * route can serialize either. Tests know which one they asked for, so this
 * narrows it in one place instead of casting at every assertion.
 */
export function itemOf<T = Record<string, any>>(response: { body(): any }): T {
  return response.body().data as T
}

export function collectionOf<T = Record<string, any>>(response: { body(): any }): T[] {
  return response.body().data as T[]
}
