/**
 * The wire contract between the server and an Android gateway.
 *
 * Every frame is a JSON envelope carrying an `id`. The id is what makes the
 * link reliable over a mobile connection: the device deduplicates inbound
 * frames by it, and the server correlates acknowledgements with it. Without
 * it, a reconnect that replays a frame would send the same SMS twice.
 */

export const ServerEvent = {
  /** Sent once the socket is authenticated; carries the device's config. */
  SESSION_READY: 'session.ready',
  SMS_SEND: 'sms.send',
  SMS_CANCEL: 'sms.cancel',
  USSD_EXECUTE: 'ussd.execute',
  /** Confirms a result was durably recorded, so the device may forget it. */
  RESULT_ACK: 'result.ack',
  CONFIG_UPDATE: 'gateway.config',
  ERROR: 'error',
} as const

export type ServerEvent = (typeof ServerEvent)[keyof typeof ServerEvent]

export const ClientEvent = {
  /** Device accepted a job and put it in its local outbox. */
  SMS_ACK: 'sms.ack',
  SMS_RESULT: 'sms.result',
  SMS_DELIVERED: 'sms.delivered',
  USSD_RESULT: 'ussd.result',
  HEARTBEAT: 'gateway.heartbeat',
  SIM_STATE: 'gateway.state',
} as const

export type ClientEvent = (typeof ClientEvent)[keyof typeof ClientEvent]

export type Envelope<TEvent extends string = string, TData = unknown> = {
  id: string
  event: TEvent
  /** Unix milliseconds, for measuring one-way latency. */
  ts: number
  data: TData
}

/**
 * A job as the device sees it. `jobId` is the message uid: the device never
 * learns internal identifiers, and support can trace a job across both sides
 * with one value.
 */
export type SmsSendPayload = {
  jobId: string
  simSlot: number
  to: string
  message: string
  /** After this instant the device must drop the job instead of sending. */
  expiresAt: string | null
}

export type SmsAckPayload = {
  jobId: string
}

export type SmsResultPayload = {
  jobId: string
  status: 'sent' | 'failed'
  providerMessageId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  /** When the device actually handed the message to the radio. */
  sentAt?: string | null
}

export type SmsDeliveredPayload = {
  jobId: string
  deliveredAt: string | null
}

/**
 * A USSD session as the device sees it.
 *
 * `steps` are the replies to send when the code opens a menu, in order. They
 * live on the server because menus change without notice and a change must be
 * a row update, not an APK rollout.
 */
export type UssdExecutePayload = {
  requestId: string
  simSlot: number
  command: string
  steps: string[]
}

export type UssdResultPayload = {
  requestId: string
  status: 'success' | 'failed' | 'unsupported'
  /** Verbatim text the network answered with, for parsing and for support. */
  response?: string | null
  errorCode?: string | null
  errorMessage?: string | null
}

export type HeartbeatPayload = {
  battery?: number
  charging?: boolean
  network?: string
  signal?: number
  inFlight?: number
  queued?: number
  sims?: { slot: number; state: string }[]
}

export type SessionReadyPayload = {
  gatewayUid: string
  nodeId: string
  heartbeatSeconds: number
  maxInFlight: number
  simProfiles: {
    uid: string
    slot: number
    label: string | null
    operator: string | null
    smsPerMinute: number
  }[]
}

export type ErrorPayload = {
  code: string
  message: string
}

let counter = 0

/**
 * Frame ids only need to be unique within a connection's lifetime, which a
 * counter plus the start time gives cheaply.
 */
export function nextFrameId(prefix = 'srv'): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`
}

export function buildEnvelope<TData>(
  event: ServerEvent,
  data: TData
): Envelope<ServerEvent, TData> {
  return { id: nextFrameId(), event, ts: Date.now(), data }
}

/**
 * Parses an inbound frame defensively. Anything a device sends is untrusted
 * input: a malformed frame must close the connection cleanly, never crash the
 * process that is holding every other device's socket.
 */
export function parseEnvelope(raw: string): Envelope | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null

  const candidate = parsed as Partial<Envelope>
  if (typeof candidate.event !== 'string' || candidate.event.length > 64) return null

  return {
    id: typeof candidate.id === 'string' ? candidate.id.slice(0, 64) : nextFrameId('dev'),
    event: candidate.event,
    ts: typeof candidate.ts === 'number' ? candidate.ts : Date.now(),
    data: candidate.data ?? {},
  }
}
