import vine from '@vinejs/vine'
import { WEBHOOK_EVENTS } from '#enums/webhook_event'

/**
 * Only https is accepted. A webhook body carries recipient numbers and
 * references; sending that over plain http would leak it to every hop, and the
 * signature proves who sent it, not who can read it.
 */
const endpointUrl = () =>
  vine
    .string()
    .trim()
    .maxLength(512)
    .url({ protocols: ['https'], require_protocol: true })

/**
 * An empty list means "every event". Stated explicitly rather than left to the
 * caller to guess, because the alternative default — nothing — would produce
 * an endpoint that silently never fires.
 */
const events = () => vine.array(vine.enum(WEBHOOK_EVENTS)).distinct().optional()

export const createWebhookEndpointValidator = vine.create({
  url: endpointUrl(),
  events: events(),
})

export const updateWebhookEndpointValidator = vine.create({
  url: endpointUrl().optional(),
  events: events(),

  /**
   * How an endpoint disabled by repeated failures is switched back on, once
   * its owner has fixed whatever was wrong.
   */
  isActive: vine.boolean().optional(),
})
