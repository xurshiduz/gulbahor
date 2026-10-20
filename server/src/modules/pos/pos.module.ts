import { Module } from '@nestjs/common'

import { CustomersModule } from '../customers/customers.module'
import { MoneyModule } from '../money/money.module'
import { StockModule } from '../stock/stock.module'
import { ApprovalsService } from './approvals.service'
import { HoldsController } from './holds.controller'
import { HoldsService } from './holds.service'
import { PosController, ReturnsController, SalesController } from './pos.controller'
import { PosService } from './pos.service'
import { ReturnsService } from './returns.service'
import { SalesService } from './sales.service'

@Module({
  imports: [MoneyModule, StockModule, CustomersModule],
  controllers: [PosController, SalesController, ReturnsController, HoldsController],
  providers: [ApprovalsService, PosService, HoldsService, SalesService, ReturnsService],
})
export class PosModule {}
