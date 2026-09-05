/**
 * Timings for USSD sessions and balance checking.
 *
 * USSD is unlike everything else the platform does: it is a live dialogue with
 * the network, it cannot be queued, and it fails often for reasons nobody can
 * see. The numbers here are all about not letting that unreliability turn into
 * either a stuck request or a flood of retries.
 */
const ussdConfig = {
  /**
   * How long a session may stay open before it is written off. Generous,
   * because a menu-driven code involves several network round trips on a link
   * that is often poor.
   */
  timeoutSeconds: 90,

  balance: {
    /**
     * Default interval between checks for a SIM that does not set its own.
     * Balances move slowly, and every check occupies the radio that would
     * otherwise be sending messages.
     */
    defaultIntervalMinutes: 180,

    /**
     * SIMs checked per pass. One at a time per device would be safest, but the
     * scheduler already spreads work across devices, so this is a cap on the
     * whole fleet rather than on any one phone.
     */
    batchSize: 5,

    /**
     * How often the scheduler looks for SIMs that are due.
     */
    intervalMs: 5 * 60 * 1000,

    /**
     * Consecutive failures after which a SIM is left alone. Almost always
     * means the operator changed its code, which is a row update, not
     * something more retries will fix.
     */
    giveUpAfterFailures: 5,
  },
} as const

export default ussdConfig
