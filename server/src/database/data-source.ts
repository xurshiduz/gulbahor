import type { DataSourceOptions } from 'typeorm'

import type { Env } from '../config/env'
import { ENTITIES } from './entities'
import { MIGRATIONS } from './migrations'
import { SnakeNamingStrategy } from './snake-naming.strategy'

type DbEnv = Pick<Env, 'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_NAME'>

export function dataSourceOptions(env: DbEnv, database = env.DB_NAME): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    namingStrategy: new SnakeNamingStrategy(),
    // The schema changes only through migrations.
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
  }
}
