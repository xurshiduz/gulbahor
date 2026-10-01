import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { QueryFailedError } from 'typeorm'

import type { ErrorBody } from './errors'

const STATUS_MESSAGES: Record<number, string> = {
  400: "So'rov noto'g'ri",
  401: 'Tizimga kiring',
  403: "Bu amal uchun ruxsatingiz yo'q",
  404: 'Topilmadi',
  429: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring",
}

/** Turns every failure into `{ error: { code, message, fields? } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http')

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const { status, body } = this.describe(exception)
    response.status(status).json({ error: body })
  }

  private describe(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const payload = exception.getResponse()
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        return { status, body: (payload as { error: ErrorBody }).error }
      }
      return {
        status,
        body: { code: HttpStatus[status] ?? 'ERROR', message: STATUS_MESSAGES[status] ?? 'Xatolik yuz berdi' },
      }
    }

    // A unique or foreign-key violation that slipped past the service checks.
    if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string }).code
      if (code === '23505') {
        return { status: 409, body: { code: 'DUPLICATE', message: 'Bunday yozuv allaqachon bor' } }
      }
      if (code === '23503') {
        return { status: 409, body: { code: 'IN_USE', message: "Bu yozuv boshqa joyda ishlatilgan, o'chirib bo'lmaydi" } }
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    return { status: 500, body: { code: 'INTERNAL', message: "Serverda xatolik yuz berdi. Qayta urinib ko'ring" } }
  }
}
