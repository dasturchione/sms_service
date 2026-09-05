import logger from '@adonisjs/core/services/logger'
import type GatewayConnection from '#realtime/gateway_connection'
import SmsResultService from '#services/sms/sms_result_service'
import GatewayPresenceService from '#services/gateway/gateway_presence_service'
import UssdService from '#services/ussd/ussd_service'
import {
  ClientEvent,
  ServerEvent,
  type Envelope,
  type HeartbeatPayload,
  type SmsAckPayload,
  type SmsDeliveredPayload,
  type SmsResultPayload,
  type UssdResultPayload,
} from '#realtime/protocol'

/**
 * Routes an inbound frame to the code that handles it.
 *
 * Everything arriving here is untrusted device input. A handler that throws
 * must not take the process down with it, because that process is holding
 * every other device's socket, so failures are contained and logged per frame.
 */
export default class MessageRouter {
  static async handle(connection: GatewayConnection, envelope: Envelope): Promise<void> {
    connection.touch()

    try {
      switch (envelope.event) {
        case ClientEvent.SMS_ACK:
          await this.handleAck(connection, envelope)
          break

        case ClientEvent.SMS_RESULT:
          await this.handleResult(connection, envelope)
          break

        case ClientEvent.SMS_DELIVERED:
          await this.handleDelivered(connection, envelope)
          break

        case ClientEvent.USSD_RESULT:
          await this.handleUssdResult(connection, envelope)
          break

        case ClientEvent.HEARTBEAT:
          await GatewayPresenceService.recordHeartbeat(
            connection,
            envelope.data as HeartbeatPayload
          )
          break

        case ClientEvent.SIM_STATE:
          await GatewayPresenceService.recordSimState(connection, envelope.data as HeartbeatPayload)
          break

        default:
          logger.debug(
            { gatewayUid: connection.gatewayUid, event: envelope.event },
            'ignoring unknown gateway event'
          )
      }
    } catch (error) {
      logger.error(
        { err: error, gatewayUid: connection.gatewayUid, event: envelope.event },
        'failed to handle gateway frame'
      )
      connection.send(ServerEvent.ERROR, {
        code: 'FRAME_FAILED',
        message: `Could not process "${envelope.event}"`,
      })
    }
  }

  private static async handleAck(connection: GatewayConnection, envelope: Envelope): Promise<void> {
    const payload = envelope.data as SmsAckPayload
    if (typeof payload?.jobId !== 'string') return

    await SmsResultService.acknowledge(connection.gatewayId, payload.jobId)
  }

  private static async handleResult(
    connection: GatewayConnection,
    envelope: Envelope
  ): Promise<void> {
    const payload = envelope.data as SmsResultPayload
    if (typeof payload?.jobId !== 'string') return
    if (payload.status !== 'sent' && payload.status !== 'failed') return

    await SmsResultService.recordResult(connection.gatewayId, payload)

    /**
     * The device keeps a result in its local outbox until this acknowledgement
     * arrives, and resends it after a reconnect otherwise. That is what makes
     * a result survive a link that drops at exactly the wrong moment.
     */
    connection.send(ServerEvent.RESULT_ACK, { jobId: payload.jobId })
  }

  private static async handleUssdResult(
    connection: GatewayConnection,
    envelope: Envelope
  ): Promise<void> {
    const payload = envelope.data as UssdResultPayload
    if (typeof payload?.requestId !== 'string') return
    if (!['success', 'failed', 'unsupported'].includes(payload.status)) return

    await UssdService.recordResult(connection.gatewayId, payload)

    /**
     * Acknowledged like an SMS result, so a device that loses the link mid
     * report can resend without wondering whether we heard it.
     */
    connection.send(ServerEvent.RESULT_ACK, { requestId: payload.requestId })
  }

  private static async handleDelivered(
    connection: GatewayConnection,
    envelope: Envelope
  ): Promise<void> {
    const payload = envelope.data as SmsDeliveredPayload
    if (typeof payload?.jobId !== 'string') return

    await SmsResultService.recordDelivered(connection.gatewayId, payload)
    connection.send(ServerEvent.RESULT_ACK, { jobId: payload.jobId })
  }
}
