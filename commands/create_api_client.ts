import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { randomBytes } from 'node:crypto'
import string from '@adonisjs/core/helpers/string'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import Tenant from '#models/tenant'
import ApiClient from '#models/api_client'
import { CLIENT_ABILITIES, DEFAULT_CLIENT_ABILITIES, type ClientAbility } from '#enums/ability'
import { TenantStatus } from '#enums/tenant'

/**
 * Provisions a tenant and its first API credentials.
 *
 * The secret is shown once and only its hash is stored, exactly like a
 * password: an operator who can read the database still cannot impersonate a
 * tenant.
 */
export default class CreateApiClient extends BaseCommand {
  static commandName = 'client:create'
  static description = 'Create a tenant (if needed) and issue API client credentials'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Tenant name, e.g. "Acme Bank"' })
  declare tenant: string

  @flags.string({ description: 'Name for the API client', default: 'default' })
  declare name: string

  @flags.array({
    description: `Abilities to grant. Available: ${CLIENT_ABILITIES.join(', ')}`,
  })
  declare abilities: string[]

  @flags.number({ description: 'Requests per minute allowed for this client', default: 60 })
  declare rateLimit: number

  async run() {
    const slug = string.slug(this.tenant, { lower: true })
    const granted = this.resolveAbilities()

    if (!granted) return

    const tenant = await Tenant.updateOrCreate(
      { slug },
      {
        name: this.tenant,
        slug,
        status: TenantStatus.ACTIVE,
        settings: {},
        createdAt: DateTime.now(),
      }
    )

    /**
     * The public half is prefixed so it is recognisable in logs and support
     * tickets; the secret half is pure entropy.
     */
    const clientId = `cid_${randomBytes(16).toString('hex')}`
    const clientSecret = randomBytes(32).toString('base64url')

    const client = await ApiClient.create({
      tenantId: tenant.id,
      name: this.name,
      clientId,
      clientSecretHash: await hash.make(clientSecret),
      abilities: granted,
      rateLimitPerMin: this.rateLimit,
      isActive: true,
      createdAt: DateTime.now(),
    })

    this.logger.success(`Tenant "${tenant.name}" (${tenant.uid}) is ready`)
    this.logger.info(`API client "${client.name}" (${client.uid})`)

    this.ui
      .table()
      .head(['Field', 'Value'])
      .row(['Client ID', clientId])
      .row(['Client secret', clientSecret])
      .row(['Abilities', granted.join(', ')])
      .render()

    this.logger.warning('The secret is not stored and cannot be shown again. Save it now.')
  }

  private resolveAbilities(): ClientAbility[] | null {
    if (!this.abilities || this.abilities.length === 0) {
      return [...DEFAULT_CLIENT_ABILITIES]
    }

    const unknown = this.abilities.filter(
      (ability) => !CLIENT_ABILITIES.includes(ability as ClientAbility)
    )

    if (unknown.length > 0) {
      this.logger.error(`Unknown abilities: ${unknown.join(', ')}`)
      this.exitCode = 1
      return null
    }

    return this.abilities as ClientAbility[]
  }
}
