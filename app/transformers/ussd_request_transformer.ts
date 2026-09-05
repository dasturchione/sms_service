import type UssdRequest from '#models/ussd_request'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * The operator's view of a USSD session.
 *
 * The raw response is included deliberately: when a parser stops working, the
 * verbatim text is the only thing that says what the operator now answers, and
 * chasing it through the database during an incident is time nobody has.
 */
export default class UssdRequestTransformer extends BaseTransformer<UssdRequest> {
  toObject() {
    const request = this.resource

    return {
      uid: request.uid,
      kind: request.kind,
      command: request.command,
      status: request.status,
      response: request.rawResponse,
      parsed: request.parsed,
      error:
        request.errorCode === null
          ? null
          : { code: request.errorCode, message: request.errorMessage },
      requestedAt: request.requestedAt,
      completedAt: request.completedAt,
    }
  }
}
