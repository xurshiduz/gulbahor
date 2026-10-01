import { Module } from '@nestjs/common'

import { PreferencesController } from './preferences.controller'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  controllers: [UsersController, PreferencesController],
  providers: [UsersService],
})
export class UsersModule {}
