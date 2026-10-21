import type { HttpContext } from '@adonisjs/core/http'
import Gateway from '#models/gateway'
import GatewayAssignmentService from '#services/gateway/gateway_assignment'
import TenantDevices from '#services/gateway/tenant_devices'
import { claimDeviceValidator, updateDeviceValidator } from '#validators/device'
import { ActorType } from '#enums/audit_action'
import { GatewayAssignment } from '#enums/gateway_status'
import type ApiClient from '#models/api_client'

/**
 * A tenant's own phones.
 *
 * A tenant installs the gateway app on its own phone, reads the code off the
 * screen (or its QR), and claims the device here. From then on the phone
 * sends only that tenant's messages, and only those that name it.
 */
export default class DevicesController {
  async index({ tenant, serialize }: HttpContext) {
    const gateways = await Gateway.query()
      .where('assignment', GatewayAssignment.TENANT)
      .where('tenant_id', tenant.id)
      .orderBy('id', 'asc')

    return serialize.withoutWrapping({ data: await TenantDevices.describe(gateways) })
  }

  async show({ params, tenant, serialize }: HttpContext) {
    const gateway = await GatewayAssignmentService.findOwned(tenant.id, params.code)
    const [view] = await TenantDevices.describe([gateway])

    return serialize(view)
  }

  /**
   * Takes an unassigned device as this tenant's own.
   *
   * Responds 201 the first time and 200 when the device is already this
   * tenant's, so a retried request is harmless.
   */
  async claim({ request, response, tenant, apiClient, serialize }: HttpContext) {
    const { code, name } = await request.validateUsing(claimDeviceValidator)

    const alreadyMine = await GatewayAssignmentService.findByCode(code)
      .then((gateway) => gateway.isOwnedBy(tenant.id))
      .catch(() => false)

    const gateway = await GatewayAssignmentService.claim(tenant, code, {
      name: name ?? null,
      actor: this.actor(apiClient),
      ctx: request.ctx,
    })

    response.status(alreadyMine ? 200 : 201)

    const [view] = await TenantDevices.describe([gateway])
    return serialize(view)
  }

  async update({ params, request, tenant, serialize }: HttpContext) {
    const { name } = await request.validateUsing(updateDeviceValidator)
    const gateway = await GatewayAssignmentService.findOwned(tenant.id, params.code)

    if (name !== undefined) {
      gateway.name = name
      await gateway.save()
    }

    const [view] = await TenantDevices.describe([gateway])
    return serialize(view)
  }

  /**
   * Gives the device back. Messages still waiting for it are failed with a
   * reason rather than left to wait forever.
   */
  async release({ params, request, tenant, apiClient, serialize }: HttpContext) {
    const gateway = await GatewayAssignmentService.release(tenant, params.code, {
      actor: this.actor(apiClient),
      ctx: request.ctx,
    })

    return serialize({ code: gateway.displayCode, released: true })
  }

  private actor(client: ApiClient) {
    return { type: ActorType.API_CLIENT, id: client.id, label: client.clientId }
  }
}
