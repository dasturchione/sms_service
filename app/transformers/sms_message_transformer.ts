import type SmsMessage from '#models/sms_message'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { SmsPriority } from '#enums/sms_status'

const PRIORITY_NAMES: Record<number, string> = {
  [SmsPriority.HIGH]: 'high',
  [SmsPriority.NORMAL]: 'normal',
  [SmsPriority.LOW]: 'low',
}

/**
 * The public shape of a message.
 *
 * Internal ids stay internal: a tenant sees `uid` only, so it cannot infer
 * platform volume or probe another tenant's records by counting upwards.
 */
export default class SmsMessageTransformer extends BaseTransformer<SmsMessage> {
  toObject() {
    const message = this.resource

    return {
      uid: message.uid,
      status: message.status,
      recipient: message.recipientNormalized,

      /**
       * Absent when the tenant configured the platform not to retain bodies.
       */
      message: message.messageBody,

      reference: message.reference,
      segments: message.segments,
      encoding: message.encoding,
      priority: PRIORITY_NAMES[message.priority] ?? 'normal',
      attempts: message.attempts,
      maxAttempts: message.maxAttempts,

      error:
        message.errorCode === null
          ? null
          : { code: message.errorCode, message: message.errorMessage },

      queuedAt: message.queuedAt,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      failedAt: message.failedAt,
      expiresAt: message.expiresAt,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    }
  }
}
