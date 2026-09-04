import type Gateway from '#models/gateway'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * The operator's view of a device. Includes live telemetry, which is what an
 * operator actually needs when deciding whether a phone is healthy.
 */
export default class GatewayTransformer extends BaseTransformer<Gateway> {
  toObject() {
    const gateway = this.resource

    return {
      uid: gateway.uid,
      name: gateway.name,
      status: gateway.status,
      isActive: gateway.isActive,
      priority: gateway.priority,
      maxInFlight: gateway.maxInFlight,

      device: {
        manufacturer: gateway.manufacturer,
        model: gateway.model,
        androidVersion: gateway.androidVersion,
        appVersion: gateway.appVersion,
      },

      telemetry: {
        battery: gateway.battery,
        isCharging: gateway.isCharging,
        network: gateway.network,
        signalLevel: gateway.signalLevel,
      },

      approvedAt: gateway.approvedAt,
      lastSeenAt: gateway.lastSeenAt,
      lastConnectedAt: gateway.lastConnectedAt,
      createdAt: gateway.createdAt,
    }
  }
}
