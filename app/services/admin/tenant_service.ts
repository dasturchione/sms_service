import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import string from '@adonisjs/core/helpers/string'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import Tenant from '#models/tenant'
import ApiClient from '#models/api_client'
import DomainException, { NotFoundException } from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { TenantStatus, type TenantSettings } from '#enums/tenant'
import { DEFAULT_CLIENT_ABILITIES, type ClientAbility } from '#enums/ability'

export type TenantCounts = {
  clients: number
  gateways: number
  messagesToday: number
}

/**
 * Tenant and credential administration.
 *
 * The same work the `client:create` command does, reachable from the panel.
 * Both go through here rather than each building a client of its own, because
 * the part that must not vary is how the secret is generated and stored.
 */
export default class TenantService {
  static async list(search?: string): Promise<Tenant[]> {
    const query = Tenant.query().orderBy('id', 'desc').limit(200)

    if (search) {
      const term = `%${search.toLowerCase()}%`
      query.where((builder) =>
        builder.whereRaw('lower(name) like ?', [term]).orWhereRaw('lower(slug) like ?', [term])
      )
    }

    return query
  }

  static async findByUid(uid: string): Promise<Tenant> {
    const tenant = await Tenant.query().where('uid', uid).first()
    if (!tenant) throw new NotFoundException('Tenant', uid)

    return tenant
  }

  /**
   * The numbers an operator looks for before doing anything else to a tenant:
   * how many credentials it holds, how many devices are dedicated to it, and
   * whether it is sending at all today.
   */
  static async countsFor(tenantId: number): Promise<TenantCounts> {
    const [clients, gateways, messages] = await Promise.all([
      db.from('api_clients').where('tenant_id', tenantId).count('* as total').first(),
      db.from('gateways').where('tenant_id', tenantId).count('* as total').first(),
      db
        .from('sms_messages')
        .where('tenant_id', tenantId)
        .whereRaw('created_at >= current_date')
        .count('* as total')
        .first(),
    ])

    return {
      clients: Number((clients as { total?: string })?.total ?? 0),
      gateways: Number((gateways as { total?: string })?.total ?? 0),
      messagesToday: Number((messages as { total?: string })?.total ?? 0),
    }
  }

  static async create(input: { name: string; slug?: string; settings?: TenantSettings }) {
    const slug = string.slug(input.slug ?? input.name, { lower: true })

    const existing = await Tenant.query().where('slug', slug).first()
    if (existing) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `A tenant with slug "${slug}" already exists`,
        { status: 422 }
      )
    }

    const tenant = await Tenant.create({
      name: input.name,
      slug,
      status: TenantStatus.ACTIVE,
      settings: input.settings ?? {},
      createdAt: DateTime.now(),
    })

    await tenant.refresh()

    return tenant
  }

  static async update(
    uid: string,
    input: { name?: string; status?: TenantStatus; settings?: TenantSettings }
  ): Promise<Tenant> {
    const tenant = await this.findByUid(uid)

    if (input.name !== undefined) tenant.name = input.name
    if (input.status !== undefined) tenant.status = input.status

    /**
     * Settings are merged rather than replaced. The panel edits one knob at a
     * time, and a PATCH that silently reset the others would be a trap.
     */
    if (input.settings !== undefined) {
      tenant.settings = { ...(tenant.settings ?? {}), ...input.settings }
    }

    await tenant.save()

    return tenant
  }

  static async listClients(tenantId: number): Promise<ApiClient[]> {
    return ApiClient.query().where('tenant_id', tenantId).orderBy('id', 'desc')
  }

  static async findClient(tenantId: number, uid: string): Promise<ApiClient> {
    const client = await ApiClient.query().where('tenant_id', tenantId).where('uid', uid).first()

    if (!client) throw new NotFoundException('API client', uid)

    return client
  }

  /**
   * Issues credentials. The secret is returned once and stored only as a hash,
   * exactly like a password: an operator with database access still cannot
   * impersonate a tenant.
   */
  static async createClient(
    tenant: Tenant,
    input: { name: string; abilities?: ClientAbility[]; rateLimitPerMin?: number }
  ): Promise<{ client: ApiClient; clientSecret: string }> {
    const clientId = `cid_${randomBytes(16).toString('hex')}`
    const clientSecret = randomBytes(32).toString('base64url')

    const client = await ApiClient.create({
      tenantId: tenant.id,
      name: input.name,
      clientId,
      clientSecretHash: await hash.make(clientSecret),
      abilities: input.abilities ?? [...DEFAULT_CLIENT_ABILITIES],
      rateLimitPerMin: input.rateLimitPerMin ?? 60,
      isActive: true,
      createdAt: DateTime.now(),
    })

    await client.refresh()

    return { client, clientSecret }
  }

  /**
   * Disabling revokes the client's live tokens as well.
   *
   * Marking it inactive alone would leave every already-issued token working
   * until it expired, which is not what anyone means by "disable".
   */
  static async updateClient(
    tenantId: number,
    uid: string,
    input: {
      name?: string
      abilities?: ClientAbility[]
      rateLimitPerMin?: number
      isActive?: boolean
    }
  ): Promise<ApiClient> {
    const client = await this.findClient(tenantId, uid)

    if (input.name !== undefined) client.name = input.name
    if (input.abilities !== undefined) client.abilities = input.abilities
    if (input.rateLimitPerMin !== undefined) client.rateLimitPerMin = input.rateLimitPerMin
    if (input.isActive !== undefined) client.isActive = input.isActive

    await client.save()

    if (input.isActive === false) {
      const tokens = await ApiClient.accessTokens.all(client)
      for (const token of tokens) {
        await ApiClient.accessTokens.delete(client, token.identifier)
      }
    }

    return client
  }
}
