/**
 * Named work queues. Every producer and consumer refers to a queue through
 * this list rather than a string literal, so a typo cannot silently create a
 * queue nothing ever drains.
 */
export const JobQueueName = {
  WEBHOOK_DELIVERY: 'webhook.delivery',
} as const

export type JobQueueName = (typeof JobQueueName)[keyof typeof JobQueueName]

/**
 * `done` never appears in practice: a finished job is deleted so the table
 * stays the size of the backlog. It exists because the column allows it and a
 * consumer reading the schema should not have to guess.
 */
export const JobStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  FAILED: 'failed',
  DONE: 'done',
} as const

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus]
