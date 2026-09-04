import type { ApplicationService } from '@adonisjs/core/types'
import logger from '@adonisjs/core/services/logger'
import GatewayNode from '#services/gateway/gateway_node'
import env from '#start/env'

/**
 * Boots the realtime gateway node alongside the HTTP server.
 *
 * It is a flag rather than an assumption so the same build can run as a plain
 * API instance, which is what a second web node behind a load balancer should
 * be: only the nodes that actually hold device sockets should dispatch.
 */
export default class GatewayProvider {
  private node: GatewayNode | null = null

  constructor(protected app: ApplicationService) {}

  async ready() {
    if (this.app.getEnvironment() !== 'web') return

    if (!env.get('GATEWAY_NODE_ENABLED', true)) {
      logger.info('gateway node disabled for this instance')
      return
    }

    const server = await this.app.container.make('server')
    const httpServer = server.getNodeServer()

    if (!httpServer) {
      logger.error('cannot start the gateway node: no HTTP server is available')
      return
    }

    this.node = new GatewayNode()
    await this.node.start(httpServer)
  }

  /**
   * Closing sockets and releasing gateways on the way out means a redeploy
   * shows up as a clean reconnect rather than a minute of phantom "online"
   * devices that nothing can reach.
   */
  async shutdown() {
    if (!this.node) return
    await this.node.stop()
    this.node = null
  }
}
