import { Module } from '@nestjs/common'

import { LocationsModule } from '../locations/locations.module'
import { MoneyModule } from '../money/money.module'
import { OrgsController } from './orgs.controller'
import { OrgsService } from './orgs.service'

@Module({
  imports: [LocationsModule, MoneyModule],
  controllers: [OrgsController],
  providers: [OrgsService],
  exports: [OrgsService],
})
export class OrgsModule {}
