import { Module } from '@nestjs/common'

import { LedgerService } from './ledger.service'
import { MoneyController, MoneyTransfersController, ShiftsController } from './money.controller'
import { MoneyService } from './money.service'
import { ShiftsService } from './shifts.service'
import { MoneyTransfersService } from './transfers.service'

@Module({
  // The transfers come first: `money/transfers` must not be read as an id by the routes under `money`.
  controllers: [MoneyTransfersController, MoneyController, ShiftsController],
  providers: [LedgerService, MoneyService, MoneyTransfersService, ShiftsService],
  exports: [LedgerService, MoneyService, MoneyTransfersService, ShiftsService],
})
export class MoneyModule {}
