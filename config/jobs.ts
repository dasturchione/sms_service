import env from '#start/env'

/**
 * Timings for the general purpose work queue.
 *
 * The queue exists for work that has no natural row of its own to live on —
 * webhook deliveries above all. Messages are not in here: `sms_messages` is
 * its own queue, and giving it a second one would mean two sources of truth
 * for the thing that matters most.
 */
const jobsConfig = {
  /**
   * Safety net for the wake-up signal, and the only thing that makes a
   * scheduled retry run at all: a job deferred by backoff has nobody to
   * announce it when its time comes.
   */
  pollIntervalMs: 2000,

  /**
   * Jobs claimed per pass, per queue.
   */
  batchSize: 10,

  /**
   * How long a worker may hold a job before another may take it. Must
   * comfortably exceed the slowest handler; a webhook delivery is bounded by
   * its own request timeout, well inside this.
   */
  leaseSeconds: 60,

  /**
   * Backoff between attempts, indexed by the attempt that just failed. A
   * receiver that is down for a deploy is back well inside the first few; one
   * that is down for an hour is covered by the tail.
   */
  backoffSeconds: [10, 60, 300, 1800, 3600],

  webhook: {
    /**
     * A receiver that has not answered by now is treated as failed and
     * retried. Held deliberately short: a slow endpoint must not be able to
     * occupy a worker.
     */
    timeoutMs: env.get('WEBHOOK_TIMEOUT_MS', 10_000),

    /**
     * Delivery attempts per event, spread over the backoff above. Five
     * attempts reach roughly an hour out.
     */
    maxAttempts: 5,

    /**
     * Consecutive failed deliveries after which an endpoint is switched off.
     * Retrying a dead URL forever costs the platform, not its owner, and the
     * disable is what makes the owner notice.
     */
    disableAfterFailures: 20,
  },
} as const

export default jobsConfig
