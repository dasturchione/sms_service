import type { WebSocket } from 'ws'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import { buildEnvelope, type ServerEvent } from '#realtime/protocol'

export type LiveGatewayState = {
  battery: number | null
  isCharging: boolean | null
  network: string | null
  signalLevel: number | null
  lastSeenAt: DateTime
}

/**
 * One authenticated device socket.
 *
 * Live telemetry is kept here rather than in the database. The socket already
 * lives in this process, so the freshest value is a field on this object;
 * writing every heartbeat straight to Postgres would be pure write
 * amplification for a value that changes every twenty seconds.
 */
export default class GatewayConnection {
  readonly gatewayId: number
  readonly gatewayUid: string
  readonly sessionId: number
  readonly connectedAt: DateTime

  private socket: WebSocket
  private closed = false

  /**
   * Set when the last flush to the database happened, so persistence can be
   * throttled independently of how often heartbeats arrive.
   */
  persistedAt: DateTime

  state: LiveGatewayState

  /**
   * Whether the peer answered the most recent ping. A socket that misses one
   * is torn down rather than left to rot, so its in-flight work is freed.
   */
  awaitingPong = false

  constructor(options: {
    socket: WebSocket
    gatewayId: number
    gatewayUid: string
    sessionId: number
  }) {
    this.socket = options.socket
    this.gatewayId = options.gatewayId
    this.gatewayUid = options.gatewayUid
    this.sessionId = options.sessionId
    this.connectedAt = DateTime.now()
    this.persistedAt = DateTime.now()
    this.state = {
      battery: null,
      isCharging: null,
      network: null,
      signalLevel: null,
      lastSeenAt: DateTime.now(),
    }
  }

  get isOpen(): boolean {
    return !this.closed && this.socket.readyState === this.socket.OPEN
  }

  /**
   * Sends a frame. Returns false instead of throwing when the socket has gone,
   * because the caller is a dispatcher deciding where to route a message, not
   * an error path: a dead socket means "pick another device".
   */
  send<TData>(event: ServerEvent, data: TData): boolean {
    if (!this.isOpen) return false

    try {
      this.socket.send(JSON.stringify(buildEnvelope(event, data)))
      return true
    } catch (error) {
      logger.warn({ err: error, gatewayUid: this.gatewayUid }, 'failed to write to gateway socket')
      return false
    }
  }

  touch(): void {
    this.state.lastSeenAt = DateTime.now()
    this.awaitingPong = false
  }

  ping(): void {
    if (!this.isOpen) return
    this.awaitingPong = true
    try {
      this.socket.ping()
    } catch {
      this.awaitingPong = false
    }
  }

  close(reason: string): void {
    this.closed = true
    try {
      this.socket.close(1000, reason.slice(0, 120))
    } catch {
      this.socket.terminate()
    }
  }

  terminate(): void {
    this.closed = true
    this.socket.terminate()
  }
}
