import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { StockModule } from '../stock/stock.module'
import { ApprovalsService } from './approvals.service'
import { PosController, ReturnsController, SalesController } from './pos.controller'
import { PosService } from './pos.service'
import { ReturnsService } from './returns.service'
import { SalesService } from './sales.service'

@Module({
  imports: [MoneyModule, StockModule],
  controllers: [PosController, SalesController, ReturnsController],
  providers: [ApprovalsService, PosService, SalesService, ReturnsService],
})
export class PosModule {}
