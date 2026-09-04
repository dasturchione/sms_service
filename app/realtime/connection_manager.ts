import type GatewayConnection from '#realtime/gateway_connection'

/**
 * The registry of device sockets held by this process.
 *
 * Deliberately in memory: a socket cannot be shared between processes, so the
 * authoritative answer to "can I reach this device right now" is local by
 * nature. The database records that a gateway is online and which node holds
 * it; this object is what actually reaches it.
 */
class ConnectionManager {
  private connections = new Map<number, GatewayConnection>()

  /**
   * Registers a socket, closing any earlier one for the same device.
   *
   * A device that reconnects before the old socket timed out would otherwise
   * leave two live sockets, and jobs would be split between them at random.
   * Last connection wins, because it is the one the device believes in.
   */
  add(connection: GatewayConnection): GatewayConnection | null {
    const previous = this.connections.get(connection.gatewayId) ?? null
    this.connections.set(connection.gatewayId, connection)

    if (previous && previous !== connection) {
      previous.close('replaced by a newer connection')
    }

    return previous
  }

  /**
   * Removes a socket, but only if it is still the current one. Without the
   * identity check, a stale socket closing after a reconnect would evict the
   * healthy connection that replaced it.
   */
  remove(connection: GatewayConnection): boolean {
    const current = this.connections.get(connection.gatewayId)
    if (current !== connection) return false

    this.connections.delete(connection.gatewayId)
    return true
  }

  get(gatewayId: number): GatewayConnection | null {
    const connection = this.connections.get(gatewayId)
    if (!connection) return null
    return connection.isOpen ? connection : null
  }

  has(gatewayId: number): boolean {
    return this.get(gatewayId) !== null
  }

  onlineGatewayIds(): number[] {
    return [...this.connections.values()].filter((c) => c.isOpen).map((c) => c.gatewayId)
  }

  all(): GatewayConnection[] {
    return [...this.connections.values()]
  }

  get size(): number {
    return this.connections.size
  }

  closeAll(reason: string): void {
    for (const connection of this.connections.values()) {
      connection.close(reason)
    }
    this.connections.clear()
  }
}

export default new ConnectionManager()
