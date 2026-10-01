import { configureValidationMessages } from '@gulbahor/core'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'

import { AppModule } from '../app.module'
import type { Env } from '../config/env'
import { OrgsService } from '../modules/orgs/orgs.service'
import { Db } from './db.service'

/**
 * `node dist/database/cli.js <command>`
 *   migrate  apply pending migrations
 *   revert   undo the last migration
 *   seed     create a sample business with its owner (local development)
 */
async function main() {
  configureValidationMessages()
  const command = process.argv[2]
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
  const logger = new Logger('cli')
  Logger.overrideLogger(['log', 'error', 'warn'])

  try {
    const dataSource = app.get(DataSource)
    if (command === 'migrate') {
      const applied = await dataSource.runMigrations()
      logger.log(applied.length ? `Applied: ${applied.map((migration) => migration.name).join(', ')}` : 'Nothing to apply')
    } else if (command === 'revert') {
      await dataSource.undoLastMigration()
      logger.log('Reverted the last migration')
    } else if (command === 'seed') {
      await dataSource.runMigrations()
      await seed(app.get(ConfigService), app.get(Db), app.get(OrgsService), logger)
    } else {
      logger.error(`Unknown command: ${command ?? '(none)'}. Use migrate, revert or seed.`)
      process.exitCode = 1
    }
  } finally {
    await app.close()
  }
}

async function seed(config: ConfigService<Env, true>, db: Db, orgs: OrgsService, logger: Logger) {
  const login = config.get('SEED_OWNER_LOGIN').toLowerCase()
  const password = config.get('SEED_OWNER_PASSWORD')
  if (!password) {
    throw new Error('Set SEED_OWNER_PASSWORD in .env before seeding')
  }

  const existing = await db.system((em) => em.query(`SELECT 1 FROM users WHERE lower(login) = $1`, [login]))
  if (existing.length) {
    logger.log(`Owner "${login}" already exists, nothing to do`)
    return
  }

  await orgs.create({ name: 'Namuna biznes', owner: { fullName: 'Biznes egasi', login, password } })
  logger.log(`Created a sample business. Sign in as "${login}" with SEED_OWNER_PASSWORD from .env`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
