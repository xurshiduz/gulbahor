import { Module } from '@nestjs/common'

import { LedgerService } from './ledger.service'
import { MoneyController, ShiftsController } from './money.controller'
import { MoneyService } from './money.service'
import { ShiftsService } from './shifts.service'

@Module({
  controllers: [MoneyController, ShiftsController],
  providers: [LedgerService, MoneyService, ShiftsService],
  exports: [LedgerService, MoneyService, ShiftsService],
})
export class MoneyModule {}
