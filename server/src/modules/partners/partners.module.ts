import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { PartnerPaymentsController, PartnersController } from './partners.controller'
import { PartnersService } from './partners.service'
import { PartnerPaymentsService } from './payments.service'

@Module({
  imports: [MoneyModule],
  controllers: [PartnersController, PartnerPaymentsController],
  providers: [PartnersService, PartnerPaymentsService],
})
export class PartnersModule {}
