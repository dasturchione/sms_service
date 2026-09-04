import { Exception } from '@adonisjs/core/exceptions'
import { ErrorCode } from '#enums/error_code'

/**
 * Base class for every failure the platform raises deliberately.
 *
 * Carrying an `ErrorCode` rather than only a message is what lets tenants
 * branch on failures programmatically and lets us group error rates without
 * parsing prose.
 */
export default class DomainException extends Exception {
  static status = 400

  declare code: ErrorCode
  readonly details: Record<string, unknown>

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(message, {
      status: options.status ?? DomainException.status,
      code,
      cause: options.cause,
    })
    this.code = code
    this.details = options.details ?? {}
  }
}

export class NotFoundException extends DomainException {
  constructor(resource: string, identifier?: string) {
    super(ErrorCode.NOT_FOUND, `${resource} not found`, {
      status: 404,
      details: identifier ? { identifier } : {},
    })
  }
}

export class ForbiddenException extends DomainException {
  constructor(message = 'You are not allowed to perform this action') {
    super(ErrorCode.FORBIDDEN, message, { status: 403 })
  }
}

export class TenantSuspendedException extends DomainException {
  constructor() {
    super(ErrorCode.TENANT_SUSPENDED, 'This account is suspended', { status: 403 })
  }
}

export class RateLimitedException extends DomainException {
  constructor(retryAfterSeconds: number) {
    super(ErrorCode.RATE_LIMITED, 'Too many requests', {
      status: 429,
      details: { retryAfterSeconds },
    })
  }
}

/**
 * Raised when a request replays an idempotency key with a different payload.
 * Returning the original result would be wrong, and sending would duplicate,
 * so the only safe answer is to refuse.
 */
export class IdempotencyConflictException extends DomainException {
  constructor(key: string) {
    super(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      'Idempotency key was already used with a different payload',
      {
        status: 409,
        details: { idempotencyKey: key },
      }
    )
  }
}
