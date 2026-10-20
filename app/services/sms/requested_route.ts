import Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import DomainException from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'
import { GatewayAssignment } from '#enums/gateway_status'
import { isDeviceCode, normalizeDeviceCode } from '#utils/device_code'

export type RouteRequest = {
  /** A device by uid: a pool device, or one of the tenant's own. */
  gatewayUid?: string | null
  /** One of the tenant's own devices, by the code shown on its screen. */
  device?: string | null
  /** A SIM slot on that device. */
  slot?: number | null
}

export type ResolvedRoute = {
  gatewayId: number | null
  slot: number | null
}

/**
 * Turns what a tenant asked for ("send through this device, this slot") into
 * ids the dispatcher understands, or refuses with a reason.
 *
 * One implementation for single, batch and bulk sends, so the three cannot
 * drift apart on who may use which device.
 */
export default class RequestedRoute {
  static async resolve(tenantId: number, request: RouteRequest): Promise<ResolvedRoute> {
    const { gatewayUid, device, slot } = request

    if (gatewayUid && device) {
      throw this.invalid('Name the device either by code or by uid, not both')
    }

    let gateway: Gateway | null = null

    if (device) {
      gateway = await this.ownDevice(tenantId, device)
    } else if (gatewayUid) {
      gateway = await Gateway.query()
        .where('uid', gatewayUid)
        .where((builder) =>
          builder
            .where('assignment', GatewayAssignment.POOL)
            .orWhere((own) =>
              own.where('assignment', GatewayAssignment.TENANT).where('tenant_id', tenantId)
            )
        )
        .first()

      if (!gateway) {
        throw new DomainException(ErrorCode.GATEWAY_NOT_FOUND, `Unknown gateway "${gatewayUid}"`, {
          status: 422,
        })
      }
    }

    if (slot === undefined || slot === null) {
      return { gatewayId: gateway?.id ?? null, slot: null }
    }

    /**
     * A slot number means nothing without a device: slot 1 of which phone?
     */
    if (!gateway) {
      throw this.invalid('A slot can only be chosen together with a device')
    }

    const sim = await SimProfile.query().where('gateway_id', gateway.id).where('slot', slot).first()
    if (!sim) {
      throw this.invalid(`Device ${gateway.displayCode} has no SIM in slot ${slot}`)
    }

    return { gatewayId: gateway.id, slot }
  }

  /**
   * Another tenant's device answers exactly like a device that does not
   * exist, so a code cannot be probed for whether it is in use.
   */
  private static async ownDevice(tenantId: number, code: string): Promise<Gateway> {
    const gateway = isDeviceCode(code)
      ? await Gateway.query()
          .where('code', normalizeDeviceCode(code))
          .where('assignment', GatewayAssignment.TENANT)
          .where('tenant_id', tenantId)
          .first()
      : null

    if (!gateway) {
      throw new DomainException(ErrorCode.GATEWAY_NOT_FOUND, `Unknown device "${code}"`, {
        status: 422,
      })
    }

    return gateway
  }

  private static invalid(message: string): DomainException {
    return new DomainException(ErrorCode.VALIDATION_FAILED, message, { status: 422 })
  }
}
