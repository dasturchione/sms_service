import app from '@adonisjs/core/services/app'
import { errors as authErrors } from '@adonisjs/auth'
import { errors as vineErrors } from '@vinejs/vine'
import { errors as lucidErrors } from '@adonisjs/lucid'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import DomainException from '#exceptions/domain_exception'
import { ErrorCode } from '#enums/error_code'

type ErrorBody = {
  error: {
    code: string
    message: string
    details?: Record<string, unknown> | unknown[]
  }
}

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Every API failure leaves the application in the same shape, so a tenant
   * can write one error handler instead of one per endpoint.
   */
  async handle(error: unknown, ctx: HttpContext) {
    const body = this.toErrorBody(error)
    if (body) {
      return ctx.response.status(this.statusFor(error)).send(body)
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }

  private statusFor(error: unknown): number {
    if (error instanceof DomainException) return error.status
    if (error instanceof vineErrors.E_VALIDATION_ERROR) return 422
    if (error instanceof authErrors.E_UNAUTHORIZED_ACCESS) return 401
    if (error instanceof lucidErrors.E_ROW_NOT_FOUND) return 404
    return 500
  }

  private toErrorBody(error: unknown): ErrorBody | null {
    if (error instanceof DomainException) {
      return {
        error: {
          code: error.code,
          message: error.message,
          ...(Object.keys(error.details).length > 0 ? { details: error.details } : {}),
        },
      }
    }

    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      return {
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'The request payload is invalid',
          details: error.messages,
        },
      }
    }

    if (error instanceof authErrors.E_UNAUTHORIZED_ACCESS) {
      return {
        error: {
          code: ErrorCode.UNAUTHENTICATED,
          message: 'Authentication is required to access this resource',
        },
      }
    }

    if (error instanceof lucidErrors.E_ROW_NOT_FOUND) {
      return {
        error: { code: ErrorCode.NOT_FOUND, message: 'Resource not found' },
      }
    }

    /**
     * Unexpected failures are only described in detail outside production,
     * where a stack trace or a database message must never reach a tenant.
     */
    if (app.inProduction) {
      return {
        error: { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred' },
      }
    }

    return null
  }
}
