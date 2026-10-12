import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { CustomersController } from './customers.controller'
import { ApprovalsService } from '../pos/approvals.service'
import { CustomersService } from './customers.service'
import { CustomerMergeService } from './merge.service'
import { OpeningImportService } from './opening-import.service'
import { CustomerPaymentsController } from './payments.controller'
import { CustomerPaymentsService } from './payments.service'

@Module({
  imports: [MoneyModule],
  controllers: [CustomerPaymentsController, CustomersController],
  // A manager's word is given at a till for a payment too; the service that hears it keeps nothing of its own.
  providers: [CustomersService, CustomerPaymentsService, CustomerMergeService, OpeningImportService, ApprovalsService],
  exports: [CustomersService],
})
export class CustomersModule {}
