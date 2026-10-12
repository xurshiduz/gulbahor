import { Module } from '@nestjs/common'

import { CatalogModule } from '../catalog/catalog.module'
import { MoneyModule } from '../money/money.module'
import { PricingModule } from '../pricing/pricing.module'
import { StockModule } from '../stock/stock.module'
import { ReceiptImportService } from './receipt-import.service'
import { ReceiptsController } from './receipts.controller'
import { ReceiptsService } from './receipts.service'

@Module({
  imports: [StockModule, CatalogModule, MoneyModule, PricingModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptImportService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
