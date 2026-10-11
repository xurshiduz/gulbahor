import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { CustomersController } from './customers.controller'
import { CustomersService } from './customers.service'
import { CustomerDebtsController } from './debts.controller'
import { CustomerDebtsService } from './debts.service'
import { CustomerPaymentsController } from './payments.controller'
import { CustomerPaymentsService } from './payments.service'

@Module({
  imports: [MoneyModule],
  controllers: [CustomerDebtsController, CustomerPaymentsController, CustomersController],
  providers: [CustomersService, CustomerDebtsService, CustomerPaymentsService],
  exports: [CustomersService],
})
export class CustomersModule {}
