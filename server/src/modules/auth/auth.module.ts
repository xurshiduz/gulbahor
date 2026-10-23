import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'

import type { Env } from '../../config/env'
import { AuditModule } from '../audit/audit.module'
import { FilesModule } from '../files/files.module'
import { ActorService } from './actor.service'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

@Global()
@Module({
  imports: [
    AuditModule,
    FilesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({ secret: config.get('JWT_SECRET') }),
    }),
  ],
  controllers: [AuthController],
  providers: [ActorService, AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [ActorService],
})
export class AuthModule {}
