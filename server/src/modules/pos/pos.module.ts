import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { StockModule } from '../stock/stock.module'
import { PosController, SalesController } from './pos.controller'
import { PosService } from './pos.service'
import { SalesService } from './sales.service'

@Module({
  imports: [MoneyModule, StockModule],
  controllers: [PosController, SalesController],
  providers: [PosService, SalesService],
})
export class PosModule {}
