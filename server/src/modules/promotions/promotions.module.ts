import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { PromotionsController } from './promotions.controller'
import { PromotionsService } from './promotions.service'

@Module({
  imports: [MoneyModule],
  controllers: [PromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
