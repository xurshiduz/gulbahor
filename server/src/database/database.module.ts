import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import type { Env } from '../config/env'
import { dataSourceOptions } from './data-source'
import { Db } from './db.service'

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const test = config.get('NODE_ENV') === 'test'
        return dataSourceOptions({
          DB_HOST: config.get('DB_HOST'),
          DB_PORT: config.get('DB_PORT'),
          DB_USERNAME: config.get('DB_USERNAME'),
          DB_PASSWORD: config.get('DB_PASSWORD'),
          // Tests never touch the working database.
          DB_NAME: (test && config.get('DB_TEST_NAME')) || config.get('DB_NAME'),
        })
      },
    }),
  ],
  providers: [Db],
  exports: [Db],
})
export class DatabaseModule {}
