import type { Server as HttpServer } from 'node:http'
import type { Server as HttpsServer } from 'node:https'
import logger from '@adonisjs/core/services/logger'
import GatewayWebSocketServer from '#realtime/ws_server'
import GatewayPresenceService from '#services/gateway/gateway_presence_service'
import SmsDispatcher from '#services/sms/sms_dispatcher'
import SmsResultService from '#services/sms/sms_result_service'
import QueueSignal from '#services/infra/queue_signal'
import AlertService from '#services/infra/alert_service'
import UssdService from '#services/ussd/ussd_service'
import BalanceScheduler from '#services/ussd/balance_scheduler'
import ussdConfig from '#config/ussd'
import connectionManager from '#realtime/connection_manager'
import gatewayConfig from '#config/gateway'

/**
 * The runtime that owns the device fleet on this process.
 *
 * Sockets cannot be shared between processes, so the dispatcher has to live
 * wherever the sockets are: a worker in another process could claim a message
 * and then have no way to deliver it. Serving devices and dispatching to them
 * is therefore one role, not two.
 */
export default class GatewayNode {
  private ws = new GatewayWebSocketServer()
  private stopListening: (() => Promise<void>) | null = null
  private sweepTimer: NodeJS.Timeout | null = null
  private balanceTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null

  /**
   * Guards against overlapping dispatch runs. A run triggered by a
   * notification must not interleave with the one the poll just started.
   */
  private dispatching = false

  /**
   * Set when a wake-up arrives while a run is already in progress, so the
   * signal is honoured on the next pass instead of being dropped.
   */
  private wakeupPending = false

  private stopped = false

  async start(httpServer: HttpServer | HttpsServer): Promise<void> {
    /**
     * A previous run of this node may have died without closing its sockets,
     * leaving gateways recorded as attached to a process that no longer
     * exists. Nothing can reach them, so they are released up front.
     */
    const released = await GatewayPresenceService.releaseOwnedGateways(gatewayConfig.nodeId)
    if (released > 0) {
      logger.info({ released }, 'released gateways left over by a previous run')
    }

    this.ws.attach(httpServer as HttpServer)

    this.stopListening = await QueueSignal.listen(() => this.wake())

    this.pollTimer = setInterval(() => this.wake(), gatewayConfig.dispatch.pollIntervalMs)
    this.pollTimer.unref()

    this.sweepTimer = setInterval(() => {
      this.sweep().catch((error) => logger.error({ err: error }, 'sweep failed'))
    }, gatewayConfig.dispatch.sweepIntervalMs)
    this.sweepTimer.unref()

    /**
     * Balance checking lives here rather than with the other periodic work
     * because a USSD session needs a socket: it can only run on the process
     * that actually holds the device.
     */
    this.balanceTimer = setInterval(() => {
      BalanceScheduler.run().catch((error) =>
        logger.error({ err: error }, 'balance scheduler failed')
      )
    }, ussdConfig.balance.intervalMs)
    this.balanceTimer.unref()

    logger.info({ nodeId: gatewayConfig.nodeId }, 'gateway node started')
  }

  /**
   * Requests a dispatch pass. Cheap to call and safe to call often: the actual
   * work is serialized behind the `dispatching` flag.
   */
  wake(): void {
    if (this.stopped) return

    if (this.dispatching) {
      this.wakeupPending = true
      return
    }

    this.runDispatch().catch((error) => logger.error({ err: error }, 'dispatch pass failed'))
  }

  private async runDispatch(): Promise<void> {
    this.dispatching = true

    try {
      do {
        this.wakeupPending = false

        if (connectionManager.size === 0) break

        const outcome = await SmsDispatcher.dispatchBatch()

        if (outcome.dispatched > 0 || outcome.expired > 0) {
          logger.debug(outcome, 'dispatch pass complete')
        }

        /**
         * A full batch means there is probably more waiting, so go round again
         * rather than idling until the next poll.
         */
        if (outcome.dispatched >= gatewayConfig.dispatch.batchSize) {
          this.wakeupPending = true
        }
      } while (this.wakeupPending && !this.stopped)
    } finally {
      this.dispatching = false
    }
  }

  /**
   * Periodic housekeeping: reclaim work from devices that went quiet, fail
   * messages whose deadline passed, and take silent gateways out of rotation.
   */
  private async sweep(): Promise<void> {
    const reclaimed = await SmsResultService.sweepExpiredLeases()
    const expired = await SmsResultService.sweepExpiredMessages()
    await UssdService.sweepStaleRequests()

    const offline = await GatewayPresenceService.markStaleGatewaysOffline()

    if (offline.length > 0) {
      logger.warn({ offline: offline.length }, 'gateways marked offline after missing heartbeats')

      for (const gateway of offline) {
        await AlertService.gatewayOffline(gateway)
      }
    }

    /**
     * Anything reclaimed is queued again, so there is work to pick up right
     * now rather than at the next poll.
     */
    if (reclaimed > 0 || expired > 0) this.wake()
  }

  async stop(): Promise<void> {
    this.stopped = true

    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    if (this.balanceTimer) clearInterval(this.balanceTimer)
    if (this.stopListening) await this.stopListening()

    await this.ws.shutdown()

    /**
     * Hand the fleet back so another node (or this one, on restart) can take
     * over without waiting for the heartbeat timeout to notice.
     */
    await GatewayPresenceService.releaseOwnedGateways(gatewayConfig.nodeId).catch(() => {})

    logger.info('gateway node stopped')
  }
}
