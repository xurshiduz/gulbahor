import { Module } from '@nestjs/common'

import { CurrenciesController } from './currencies.controller'
import { CurrenciesService } from './currencies.service'
import { LedgerService } from './ledger.service'
import { MoneyController, MoneyTransfersController, ShiftsController } from './money.controller'
import { MoneyService } from './money.service'
import { MoneyOpsController } from './ops.controller'
import { MoneyOpsService } from './ops.service'
import { ShiftsService } from './shifts.service'
import { MoneyTransfersService } from './transfers.service'

@Module({
  // The transfers and the expenses come first: `money/transfers` and `money/ops` must not be read as an id
  // by the routes under `money`.
  controllers: [MoneyTransfersController, MoneyOpsController, MoneyController, ShiftsController, CurrenciesController],
  providers: [LedgerService, MoneyService, MoneyTransfersService, MoneyOpsService, ShiftsService, CurrenciesService],
  exports: [LedgerService, MoneyService, MoneyTransfersService, MoneyOpsService, ShiftsService, CurrenciesService],
})
export class MoneyModule {}
