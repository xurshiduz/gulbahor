import { Module } from '@nestjs/common'

import { StockModule } from '../stock/stock.module'
import { StockDocsController } from './stockdocs.controller'
import { StockDocsService } from './stockdocs.service'

@Module({
  imports: [StockModule],
  controllers: [StockDocsController],
  providers: [StockDocsService],
})
export class StockDocsModule {}
