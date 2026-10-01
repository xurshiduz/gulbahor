import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DataSource } from 'typeorm'

import { AppModule } from './app.module'
import type { Env } from './config/env'
import { setupApp } from './setup-app'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  setupApp(app)
  app.enableShutdownHooks()

  const applied = await app.get(DataSource).runMigrations()
  if (applied.length) {
    Logger.log(`Applied migrations: ${applied.map((migration) => migration.name).join(', ')}`, 'Database')
  }

  const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT')
  await app.listen(port)
  Logger.log(`API on http://localhost:${port}/api`, 'Bootstrap')
}

void bootstrap()
