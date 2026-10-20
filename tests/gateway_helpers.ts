import { WebSocket } from 'ws'
import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import GatewayWebSocketServer from '#realtime/ws_server'
import connectionManager from '#realtime/connection_manager'
import type Gateway from '#models/gateway'
import SimProfile from '#models/sim_profile'
import Operator from '#models/operator'
import User from '#models/user'
import GatewayService from '#services/gateway/gateway_service'
import gatewayConfig from '#config/gateway'
import { GatewayAssignment, GatewayStatus, SimState } from '#enums/gateway_status'
import { UserRole } from '#enums/tenant'
import { parseEnvelope, type Envelope } from '#realtime/protocol'

/**
 * Attaches the realtime endpoint to the test HTTP server.
 *
 * The background dispatch loop stays off in tests (see `.env.test`): a test
 * that races a timer is a test that fails on a slow machine and passes on a
 * fast one. Tests drive `SmsDispatcher` explicitly instead.
 */
export async function startGatewayServer(): Promise<GatewayWebSocketServer> {
  const server = await app.container.make('server')
  const nodeServer = server.getNodeServer()

  if (!nodeServer) {
    throw new Error('the test HTTP server is not running')
  }

  const ws = new GatewayWebSocketServer()
  ws.attach(nodeServer)
  return ws
}

export async function stopGatewayServer(ws: GatewayWebSocketServer): Promise<void> {
  await ws.shutdown()
  connectionManager.closeAll('test finished')
}

export function gatewayUrl(token: string): string {
  const host = env.get('HOST')
  const port = env.get('PORT')
  return `ws://${host}:${port}${gatewayConfig.websocket.path}?token=${encodeURIComponent(token)}`
}

/**
 * A platform operator: a user with no tenant, which is what grants the right
 * to approve devices.
 */
export async function createPlatformOperator(): Promise<{ user: User; bearer: string }> {
  const user = await User.create({
    fullName: 'Platform Operator',
    email: `ops-${randomBytes(4).toString('hex')}@example.com`,
    password: randomBytes(16).toString('base64url'),
    tenantId: null,
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: DateTime.now(),
  })

  const token = await User.accessTokens.create(user)

  return { user, bearer: `Bearer ${token.value!.release()}` }
}

/**
 * Provisions an approved device with one ready SIM, skipping the HTTP
 * onboarding dance for tests that are about something else.
 */
export async function createApprovedGateway(
  options: {
    operatorCode?: string
    smsPerMinute?: number
    priority?: number
    tenantId?: number | null
    maxInFlight?: number
    /** Override of the SIM's daily distinct-recipient cap. */
    recipientLimit?: number | null
  } = {}
): Promise<{ gateway: Gateway; simProfile: SimProfile; token: string }> {
  /**
   * Registration hands out the token at once; the device then carries
   * traffic only once it is assigned. Pool by default, or a tenant's own
   * phone when `tenantId` is given.
   */
  const registered = await GatewayService.register({
    deviceId: `dev-${randomBytes(8).toString('hex')}`,
    deviceName: 'Test Phone',
    manufacturer: 'Samsung',
    model: 'A15',
    androidVersion: '15',
    appVersion: '1.0.0',
  })
  const gateway = registered.gateway

  gateway.merge({
    assignment: options.tenantId ? GatewayAssignment.TENANT : GatewayAssignment.POOL,
    tenantId: options.tenantId ?? null,
    priority: options.priority ?? gateway.priority,
    maxInFlight: options.maxInFlight ?? gateway.maxInFlight,
  })
  await gateway.save()

  const claimed = { gateway, token: registered.token! }

  const operator = await ensureOperator(options.operatorCode ?? 'beeline')

  const simProfile = await SimProfile.create({
    gatewayId: gateway.id,
    slot: 0,
    operatorId: operator?.id ?? null,
    label: operator?.name ?? 'Test SIM',
    state: SimState.READY,
    isActive: true,
    smsPerMinute: options.smsPerMinute ?? 60,
    dailyRecipientLimit: options.recipientLimit ?? null,
    createdAt: DateTime.now(),
  })

  await claimed.gateway.refresh()

  return { gateway: claimed.gateway, simProfile, token: claimed.token }
}

/**
 * Adds another SIM slot to an existing device, for dual SIM scenarios.
 */
export async function addSimProfile(
  gateway: Gateway,
  slot: number,
  options: { operatorCode?: string; recipientLimit?: number | null; smsPerMinute?: number } = {}
): Promise<SimProfile> {
  const operator = await ensureOperator(options.operatorCode ?? 'beeline')

  return SimProfile.create({
    gatewayId: gateway.id,
    slot,
    operatorId: operator.id,
    label: `${operator.name} slot ${slot}`,
    state: SimState.READY,
    isActive: true,
    smsPerMinute: options.smsPerMinute ?? 60,
    dailyRecipientLimit: options.recipientLimit ?? null,
    createdAt: DateTime.now(),
  })
}

/**
 * Operators are reference data owned by a seeder, and the functional suite
 * starts from an empty database. Creating on demand keeps these tests
 * independent of seeder ordering.
 */
export async function ensureOperator(code: string): Promise<Operator> {
  const known: Record<string, { name: string; mcc: string; mnc: string; prefixes: string[] }> = {
    beeline: { name: 'Beeline', mcc: '434', mnc: '04', prefixes: ['90', '91'] },
    ucell: { name: 'Ucell', mcc: '434', mnc: '05', prefixes: ['93', '94'] },
    mobiuz: { name: 'Mobiuz', mcc: '434', mnc: '07', prefixes: ['88', '97'] },
  }

  const definition = known[code] ?? { name: code, mcc: null!, mnc: null!, prefixes: [] }

  return Operator.updateOrCreate(
    { code },
    {
      name: definition.name,
      code,
      country: 'UZ',
      mcc: definition.mcc ?? null,
      mnc: definition.mnc ?? null,
      phonePrefixes: definition.prefixes,
      isActive: true,
      createdAt: DateTime.now(),
    }
  )
}

/**
 * Stands in for the Android app.
 *
 * Speaks the real protocol over a real socket rather than stubbing the
 * connection manager, so the tests exercise authentication, framing and the
 * router exactly as a phone would.
 */
export class FakeDevice {
  private socket: WebSocket
  private inbox: Envelope[] = []
  private waiters: { event: string; resolve: (envelope: Envelope) => void }[] = []

  private constructor(socket: WebSocket) {
    this.socket = socket

    socket.on('message', (raw) => {
      const envelope = parseEnvelope(raw.toString())
      if (!envelope) return

      const index = this.waiters.findIndex((waiter) => waiter.event === envelope.event)
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1)
        waiter.resolve(envelope)
        return
      }

      this.inbox.push(envelope)
    })
  }

  static async connect(token: string): Promise<FakeDevice> {
    const socket = new WebSocket(gatewayUrl(token))

    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve())
      socket.once('error', reject)
      socket.once('unexpected-response', (_request, response) =>
        reject(new Error(`upgrade rejected with ${response.statusCode}`))
      )
    })

    return new FakeDevice(socket)
  }

  /**
   * Asserts that a connection is refused, which is the expected outcome for a
   * device that is not approved or whose token was revoked.
   */
  static async expectRejected(token: string): Promise<number> {
    const socket = new WebSocket(gatewayUrl(token))

    return new Promise<number>((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => {
        socket.terminate()
        resolve(response.statusCode ?? 0)
      })
      socket.once('open', () => {
        socket.terminate()
        reject(new Error('the connection was accepted but should have been refused'))
      })
      socket.once('error', () => {
        /* the rejection surfaces through unexpected-response */
      })
    })
  }

  send(event: string, data: unknown): void {
    this.socket.send(
      JSON.stringify({ id: `dev_${randomBytes(4).toString('hex')}`, event, ts: Date.now(), data })
    )
  }

  /**
   * Waits for a specific frame. Frames that already arrived are matched first,
   * so a test cannot lose a race against a fast server.
   */
  async waitFor(event: string, timeoutMs = 3000): Promise<Envelope> {
    const buffered = this.inbox.findIndex((envelope) => envelope.event === event)
    if (buffered >= 0) {
      const [envelope] = this.inbox.splice(buffered, 1)
      return envelope
    }

    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        const seen = this.inbox.map((envelope) => envelope.event).join(', ') || 'nothing'
        reject(new Error(`timed out waiting for "${event}"; received ${seen}`))
      }, timeoutMs)

      this.waiters.push({
        event,
        resolve: (envelope) => {
          clearTimeout(timer)
          resolve(envelope)
        },
      })
    })
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return

    await new Promise<void>((resolve) => {
      this.socket.once('close', () => resolve())
      this.socket.close()
      setTimeout(resolve, 500)
    })
  }
}

/**
 * Polls until a condition holds. Used where the server does work in reaction to
 * a frame, which is by nature not synchronous with the test.
 */
export async function eventually(
  check: () => Promise<boolean>,
  { timeoutMs = 3000, intervalMs = 25 } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('condition was not met before the timeout')
}

export { GatewayStatus }
