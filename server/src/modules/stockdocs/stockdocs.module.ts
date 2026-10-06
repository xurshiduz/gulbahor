import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { ReceiptsModule } from '../receipts/receipts.module'
import { StockModule } from '../stock/stock.module'
import { StockDocsController } from './stockdocs.controller'
import { StockDocsService } from './stockdocs.service'

@Module({
  imports: [StockModule, ReceiptsModule, MoneyModule],
  controllers: [StockDocsController],
  providers: [StockDocsService],
})
export class StockDocsModule {}
