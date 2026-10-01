import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Every error the API returns has the same shape:
 * `{ error: { code, message, fields? } }`. `message` is written for the
 * person at the screen, in Uzbek; `code` is what the client branches on.
 */
export interface ErrorBody {
  code: string
  message: string
  fields?: Record<string, string>
}

export class AppError extends HttpException {
  constructor(status: HttpStatus, body: ErrorBody) {
    super({ error: body }, status)
  }

  static badRequest(code: string, message: string, fields?: Record<string, string>) {
    return new AppError(HttpStatus.BAD_REQUEST, { code, message, fields })
  }

  static validation(fields: Record<string, string>, message = "Ma'lumotlar noto'g'ri kiritilgan") {
    return new AppError(HttpStatus.BAD_REQUEST, { code: 'VALIDATION', message, fields })
  }

  static unauthorized(code = 'UNAUTHORIZED', message = 'Tizimga kiring') {
    return new AppError(HttpStatus.UNAUTHORIZED, { code, message })
  }

  static forbidden(message = "Bu amal uchun ruxsatingiz yo'q", code = 'FORBIDDEN') {
    return new AppError(HttpStatus.FORBIDDEN, { code, message })
  }

  static notFound(message = 'Topilmadi') {
    return new AppError(HttpStatus.NOT_FOUND, { code: 'NOT_FOUND', message })
  }

  static conflict(code: string, message: string, fields?: Record<string, string>) {
    return new AppError(HttpStatus.CONFLICT, { code, message, fields })
  }
}
