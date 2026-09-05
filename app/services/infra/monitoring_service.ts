import db from '@adonisjs/lucid/services/db'
import JobQueue from '#services/infra/job_queue'
import connectionManager from '#realtime/connection_manager'
import { GatewayStatus } from '#enums/gateway_status'
import { SmsStatus } from '#enums/sms_status'

export type PlatformSnapshot = {
  queue: { depth: number; oldestQueuedSeconds: number | null; byStatus: Record<string, number> }
  jobs: Record<string, { pending: number; failed: number }>
  gateways: { online: number; total: number; connectedToThisNode: number }
  recent: { total: number; sent: number; failed: number }
}

/**
 * The window recent success rate is measured over. Five minutes is short
 * enough that an outage shows up while it is happening and long enough that a
 * quiet minute does not read as a 0% success rate.
 */
const RECENT_WINDOW_MINUTES = 5

/**
 * Gathers the numbers the platform is judged by.
 *
 * Every query here is bounded: counts over indexed predicates or over a five
 * minute window. A metrics endpoint that gets slower as the platform grows
 * would go down exactly when it is most needed.
 */
export default class MonitoringService {
  static async snapshot(): Promise<PlatformSnapshot> {
    const [byStatus, oldest, jobs, gateways, recent] = await Promise.all([
      this.messagesByStatus(),
      this.oldestQueuedSeconds(),
      JobQueue.depth(),
      this.gatewayCounts(),
      this.recentOutcomes(),
    ])

    const depth =
      (byStatus[SmsStatus.QUEUED] ?? 0) +
      (byStatus[SmsStatus.ASSIGNED] ?? 0) +
      (byStatus[SmsStatus.SENDING] ?? 0)

    return {
      queue: { depth, oldestQueuedSeconds: oldest, byStatus },
      jobs,
      gateways,
      recent,
    }
  }

  /**
   * Prometheus exposition format. Written by hand rather than pulled in as a
   * dependency: it is a dozen lines of text, and a client library would bring
   * a registry, a default metric set and a process collector we did not ask
   * for.
   */
  static async prometheus(): Promise<string> {
    const snapshot = await this.snapshot()
    const lines: string[] = []

    const metric = (name: string, help: string, type: string) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`)
    }

    metric('sms_queue_depth', 'Messages waiting for or held by a device', 'gauge')
    lines.push(`sms_queue_depth ${snapshot.queue.depth}`)

    metric('sms_messages_in_flight', 'Messages by non terminal status', 'gauge')
    for (const [status, count] of Object.entries(snapshot.queue.byStatus)) {
      lines.push(`sms_messages_in_flight{status="${status}"} ${count}`)
    }

    metric('sms_queue_oldest_seconds', 'Age of the oldest queued message', 'gauge')
    lines.push(`sms_queue_oldest_seconds ${snapshot.queue.oldestQueuedSeconds ?? 0}`)

    metric('sms_gateways_online', 'Devices the platform believes are online', 'gauge')
    lines.push(`sms_gateways_online ${snapshot.gateways.online}`)

    metric('sms_gateways_connected', 'Devices whose socket lives on this node', 'gauge')
    lines.push(`sms_gateways_connected ${snapshot.gateways.connectedToThisNode}`)

    metric('sms_jobs', 'Background jobs by queue and state', 'gauge')
    for (const [queue, counts] of Object.entries(snapshot.jobs)) {
      lines.push(`sms_jobs{queue="${queue}",state="pending"} ${counts.pending}`)
      lines.push(`sms_jobs{queue="${queue}",state="failed"} ${counts.failed}`)
    }

    metric(
      'sms_recent_messages',
      `Messages created in the last ${RECENT_WINDOW_MINUTES} minutes, by outcome`,
      'gauge'
    )
    lines.push(`sms_recent_messages{outcome="total"} ${snapshot.recent.total}`)
    lines.push(`sms_recent_messages{outcome="sent"} ${snapshot.recent.sent}`)
    lines.push(`sms_recent_messages{outcome="failed"} ${snapshot.recent.failed}`)

    return `${lines.join('\n')}\n`
  }

  /**
   * Proves the platform can do its job, not merely that the process is up.
   * Liveness answers while the database is down; readiness must not, or a load
   * balancer would keep sending traffic to an instance that can only fail it.
   */
  static async readiness(): Promise<{ ready: boolean; checks: Record<string, string> }> {
    const checks: Record<string, string> = {}

    try {
      await db.rawQuery('SELECT 1')
      checks.database = 'ok'
    } catch (error) {
      checks.database = error instanceof Error ? error.message : 'unavailable'
    }

    return { ready: Object.values(checks).every((value) => value === 'ok'), checks }
  }

  private static async messagesByStatus(): Promise<Record<string, number>> {
    const rows = await db
      .from('sms_messages')
      .whereIn('status', [
        SmsStatus.CREATED,
        SmsStatus.QUEUED,
        SmsStatus.ASSIGNED,
        SmsStatus.SENDING,
      ])
      .select('status')
      .count('* as total')
      .groupBy('status')

    const counts: Record<string, number> = {}
    for (const row of rows as Record<string, any>[]) {
      counts[row.status] = Number(row.total)
    }
    return counts
  }

  /**
   * The single most useful number about a queue: not how deep it is, but how
   * long the message at the bottom has been waiting.
   */
  private static async oldestQueuedSeconds(): Promise<number | null> {
    const row = await db
      .from('sms_messages')
      .where('status', SmsStatus.QUEUED)
      .min('queued_at as oldest')
      .first()

    const oldest = (row as { oldest?: Date })?.oldest
    if (!oldest) return null

    return Math.max(0, Math.round((Date.now() - new Date(oldest).getTime()) / 1000))
  }

  private static async gatewayCounts() {
    const rows = await db.from('gateways').select('status').count('* as total').groupBy('status')

    let online = 0
    let total = 0

    for (const row of rows as Record<string, any>[]) {
      const count = Number(row.total)
      total += count
      if (row.status === GatewayStatus.ONLINE) online = count
    }

    return { online, total, connectedToThisNode: connectionManager.size }
  }

  private static async recentOutcomes() {
    const row = await db
      .from('sms_messages')
      .whereRaw(`created_at > now() - interval '${RECENT_WINDOW_MINUTES} minutes'`)
      .select(
        db.raw('COUNT(*) AS total'),
        db.raw(`COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')) AS sent`),
        db.raw(`COUNT(*) FILTER (WHERE status IN ('failed', 'expired')) AS failed`)
      )
      .first()

    const values = row as Record<string, any>

    return {
      total: Number(values?.total ?? 0),
      sent: Number(values?.sent ?? 0),
      failed: Number(values?.failed ?? 0),
    }
  }
}
