import { Module } from '@nestjs/common'

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
  controllers: [MoneyTransfersController, MoneyOpsController, MoneyController, ShiftsController],
  providers: [LedgerService, MoneyService, MoneyTransfersService, MoneyOpsService, ShiftsService],
  exports: [LedgerService, MoneyService, MoneyTransfersService, MoneyOpsService, ShiftsService],
})
export class MoneyModule {}
