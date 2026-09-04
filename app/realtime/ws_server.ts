import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Server as HttpsServer } from 'node:https'
import type { Duplex } from 'node:stream'
import logger from '@adonisjs/core/services/logger'
import GatewayConnection from '#realtime/gateway_connection'
import GatewayAuthenticator from '#realtime/gateway_authenticator'
import MessageRouter from '#realtime/message_router'
import connectionManager from '#realtime/connection_manager'
import GatewayService from '#services/gateway/gateway_service'
import type Gateway from '#models/gateway'
import GatewayPresenceService from '#services/gateway/gateway_presence_service'
import { parseEnvelope, ServerEvent } from '#realtime/protocol'
import gatewayConfig from '#config/gateway'

/**
 * The realtime endpoint devices attach to.
 *
 * Runs on the same HTTP server as the API rather than on a port of its own, so
 * there is one TLS certificate, one hostname and one firewall rule to get
 * right instead of two.
 */
export default class GatewayWebSocketServer {
  private server: WebSocketServer
  private heartbeatTimer: NodeJS.Timeout | null = null

  /**
   * Kept so the listener can be detached again. It is registered on the shared
   * HTTP server, which outlives this object: leaving it behind would let a
   * closed instance keep intercepting upgrades.
   */
  private upgradeHandler:
    ((request: IncomingMessage, socket: Duplex, head: Buffer) => void) | null = null

  private httpServer: HttpServer | HttpsServer | null = null

  constructor() {
    /**
     * `noServer` because the upgrade is authenticated before a socket is
     * created: an unauthenticated peer never gets a WebSocket at all.
     */
    this.server = new WebSocketServer({
      noServer: true,
      maxPayload: gatewayConfig.websocket.maxPayloadBytes,
    })
  }

  attach(httpServer: HttpServer | HttpsServer): void {
    this.httpServer = httpServer
    this.upgradeHandler = (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost')

      /**
       * Upgrades to any other path are left alone, so this does not interfere
       * with anything else the application may add later.
       */
      if (url.pathname !== gatewayConfig.websocket.path) return

      this.handleUpgrade(request, socket, head).catch((error) => {
        logger.error({ err: error }, 'gateway upgrade failed')
        this.rejectUpgrade(socket, 500, 'Internal Server Error')
      })
    }

    httpServer.on('upgrade', this.upgradeHandler)

    this.startHeartbeat()
    logger.info(
      { path: gatewayConfig.websocket.path, nodeId: gatewayConfig.nodeId },
      'gateway websocket endpoint ready'
    )
  }

  private async handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): Promise<void> {
    const outcome = await GatewayAuthenticator.authenticate(request)

    if (!outcome.ok) {
      logger.warn({ reason: outcome.reason }, 'rejected gateway upgrade')
      this.rejectUpgrade(socket, outcome.code === 4403 ? 403 : 401, outcome.reason)
      return
    }

    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.onConnection(ws, request, outcome.gateway).catch((error) => {
        logger.error({ err: error }, 'failed to establish gateway session')
        ws.terminate()
      })
    })
  }

  private async onConnection(
    socket: WebSocket,
    request: IncomingMessage,
    gateway: Gateway
  ): Promise<void> {
    const session = await GatewayService.markConnected(gateway, {
      nodeId: gatewayConfig.nodeId,
      ipAddress: request.socket.remoteAddress ?? null,
      appVersion: gateway.appVersion,
    })

    const connection = new GatewayConnection({
      socket,
      gatewayId: gateway.id,
      gatewayUid: gateway.uid,
      sessionId: Number(session.id),
    })

    connectionManager.add(connection)

    socket.on('message', (raw) => {
      const envelope = parseEnvelope(raw.toString())

      /**
       * A frame we cannot parse means the peer is not speaking our protocol.
       * Closing is safer than guessing.
       */
      if (!envelope) {
        connection.close('malformed frame')
        return
      }

      MessageRouter.handle(connection, envelope).catch((error) => {
        logger.error({ err: error, gatewayUid: connection.gatewayUid }, 'router rejected a frame')
      })
    })

    socket.on('pong', () => connection.touch())
    socket.on('error', (error) => {
      logger.warn({ err: error, gatewayUid: connection.gatewayUid }, 'gateway socket error')
    })
    socket.on('close', (code, reason) => {
      this.onClose(connection, `${code}:${reason.toString().slice(0, 40)}`).catch((error) => {
        logger.error({ err: error }, 'failed to tear down gateway session')
      })
    })

    connection.send(
      ServerEvent.SESSION_READY,
      await GatewayPresenceService.describeSession(gateway)
    )

    logger.info(
      { gatewayUid: gateway.uid, connections: connectionManager.size },
      'gateway connected'
    )
  }

  private async onClose(connection: GatewayConnection, reason: string): Promise<void> {
    const wasCurrent = connectionManager.remove(connection)

    /**
     * Persist the last telemetry we saw before the session ends, otherwise the
     * final twenty seconds of a device's life are lost.
     */
    await GatewayPresenceService.flush(connection).catch(() => {})

    await GatewayService.markDisconnected(connection.gatewayId, connection.sessionId, {
      nodeId: gatewayConfig.nodeId,
      reason,
    })

    logger.info(
      { gatewayUid: connection.gatewayUid, reason, replaced: !wasCurrent },
      'gateway disconnected'
    )
  }

  /**
   * Pings every device on a fixed cadence and terminates any that missed the
   * previous one.
   *
   * TCP will not tell us that a phone drove into a tunnel; without this, dead
   * sockets would look healthy and keep being handed messages.
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const connection of connectionManager.all()) {
        if (connection.awaitingPong) {
          logger.warn({ gatewayUid: connection.gatewayUid }, 'gateway missed a ping, terminating')
          connection.terminate()
          continue
        }
        connection.ping()
      }
    }, gatewayConfig.websocket.heartbeatSeconds * 1000)

    this.heartbeatTimer.unref()
  }

  private rejectUpgrade(socket: Duplex, status: number, reason: string): void {
    const text = `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`
    socket.write(text)
    socket.destroy()
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)

    if (this.httpServer && this.upgradeHandler) {
      this.httpServer.off('upgrade', this.upgradeHandler)
      this.upgradeHandler = null
      this.httpServer = null
    }

    connectionManager.closeAll('server shutting down')
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}
