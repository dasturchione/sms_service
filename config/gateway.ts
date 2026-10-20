import env from '#start/env'
import { hostname } from 'node:os'

/**
 * Timings that govern the device fleet.
 *
 * They are collected here because they are interdependent: the lease must
 * outlast the ack window, the offline threshold must outlast several missed
 * heartbeats, and changing one without the others produces either phantom
 * duplicates or gateways that look dead while they are fine.
 */
const gatewayConfig = {
  /**
   * Identifies this application instance. A device's socket lives in exactly
   * one process, so a dispatcher running elsewhere needs to know where to
   * send the job.
   */
  nodeId: env.get('NODE_ID', `${hostname()}-${process.pid}`),

  websocket: {
    path: '/ws/gateway',

    /**
     * How often the device reports in. Everything below is a multiple of it.
     */
    heartbeatSeconds: 20,

    /**
     * A socket that has not produced a pong within this window is considered
     * dead and torn down, so its messages can be re-dispatched rather than
     * waiting for TCP to notice.
     */
    pongTimeoutSeconds: 60,

    /**
     * Guards against a client that opens a socket and never authenticates.
     */
    authTimeoutSeconds: 10,

    /**
     * Refuses oversized frames outright. A legitimate frame is a few hundred
     * bytes.
     */
    maxPayloadBytes: 64 * 1024,
  },

  dispatch: {
    /**
     * Safety net for the LISTEN/NOTIFY wake-up. Notifications are not durable,
     * so a poll this often guarantees nothing is stranded even if one is lost.
     */
    pollIntervalMs: 2000,

    /**
     * Messages claimed per pass. Small enough that one worker cannot starve
     * another, large enough to amortise the round trip.
     */
    batchSize: 25,

    /**
     * A device must acknowledge receipt within this window or the message goes
     * back to the queue.
     */
    ackTimeoutSeconds: 10,

    /**
     * How long a device may hold a message after acknowledging it before we
     * assume it is lost and send it elsewhere.
     *
     * Must outlast the device's own patience: the app waits up to three
     * minutes for the radio's verdict before giving up on a send
     * (`STUCK_JOB_MS` in GatewayService.kt). A shorter lease reclaims a
     * message the phone may still send, and the customer gets it twice.
     */
    leaseSeconds: 300,

    /**
     * How often expired leases and expired messages are swept up.
     */
    sweepIntervalMs: 15_000,
  },

  presence: {
    /**
     * A gateway that has not been heard from for this long is marked offline
     * and stops receiving work. Three missed heartbeats.
     */
    offlineAfterSeconds: 60,

    /**
     * Heartbeats arrive every 20 seconds per device. Persisting each one would
     * be pure write amplification, since the live value already sits in memory
     * next to the socket. This is how often it is flushed to the database.
     */
    persistEverySeconds: 30,
  },

  provisioning: {
    /**
     * How long an operator-issued claim code stays valid. Long enough to walk
     * to the phone, short enough that a leaked code is worthless tomorrow.
     */
    claimCodeTtlMinutes: 30,
  },

  routing: {
    /**
     * The zone the operators' day is counted in. Daily caps (distinct
     * recipients, message quota) reset at midnight here, not at midnight UTC,
     * which in Tashkent would be five in the morning.
     */
    billingTimezone: env.get('BILLING_TIMEZONE', 'Asia/Tashkent'),

    /**
     * How new recipients are spread over SIMs that still have allowance left.
     *
     * - `sequential` fills SIMs one after another, in fleet order: a new number
     *   goes to the next SIM only once the previous one has reached its cap,
     *   and waits for that SIM rather than opening a slot elsewhere. Keeps
     *   spare SIMs untouched, at the cost of throughput, since one SIM paces
     *   all new numbers.
     * - `spread` lets every SIM with allowance take new numbers, which is
     *   several times faster for the same total capacity.
     *
     * A number already allowed on a SIM today always goes back to that SIM in
     * both modes: it costs no allowance there.
     */
    fillStrategy: env.get('ROUTING_FILL_STRATEGY', 'spread') as 'sequential' | 'spread',

    /**
     * Cap applied to a SIM whose operator is unknown. Conservative on purpose:
     * guessing too high gets the SIM blocked, guessing too low only delays.
     */
    defaultDailyRecipientLimit: 60,

    /**
     * How long a message waits before looking again once every SIM has used
     * up its allowance. Long enough not to spin for hours until midnight,
     * short enough to pick up a newly connected device within minutes.
     */
    allowanceExhaustedRetrySeconds: 300,
  },
} as const

export default gatewayConfig
