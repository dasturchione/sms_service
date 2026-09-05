import type { ApplicationService } from '@adonisjs/core/types'
import logger from '@adonisjs/core/services/logger'
import JobRunner from '#services/infra/job_runner'
import PeriodicTasks from '#services/infra/periodic_tasks'
import WebhookSender from '#services/webhooks/webhook_sender'
import { JobQueueName } from '#enums/job'
import env from '#start/env'

/**
 * Boots the background job runner and the periodic tasks alongside the HTTP
 * server.
 *
 * Kept separate from the gateway node because the two roles do not have to
 * live together: device sockets pin the dispatcher to one process, but a
 * webhook delivery is stateless and can run anywhere. Splitting them lets a
 * deployment move outbound traffic off the box that holds the fleet.
 */
export default class WorkerProvider {
  private runner: JobRunner | null = null
  private periodic: PeriodicTasks | null = null

  constructor(protected app: ApplicationService) {}

  async ready() {
    if (this.app.getEnvironment() !== 'web') return

    if (!env.get('WORKER_ENABLED', true)) {
      logger.info('background job runner disabled for this instance')
      return
    }

    this.runner = new JobRunner()
    this.runner.register(JobQueueName.WEBHOOK_DELIVERY, WebhookSender.handle.bind(WebhookSender))
    this.runner.start()

    this.periodic = new PeriodicTasks()
    this.periodic.start()
  }

  async shutdown() {
    this.runner?.stop()
    this.runner = null

    this.periodic?.stop()
    this.periodic = null
  }
}
