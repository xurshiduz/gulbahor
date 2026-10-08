import { configureValidationMessages } from '@erp/core'
import { ConfigService } from '@nestjs/config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'

import { AllExceptionsFilter } from './common/exception.filter'
import type { Env } from './config/env'

/** Everything the HTTP app needs besides its modules; shared by the server and the tests. */
export function setupApp(app: NestExpressApplication): void {
  configureValidationMessages()
  const config = app.get<ConfigService<Env, true>>(ConfigService)

  // nginx sits in front in production; the client address comes from its header.
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cookieParser())
  // A receipt or an imported spreadsheet can run to thousands of lines.
  app.useBodyParser('json', { limit: '8mb' })
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true })
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new AllExceptionsFilter())
}
