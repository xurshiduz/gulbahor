import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { CustomersController } from './customers.controller'
import { CustomersService } from './customers.service'
import { CustomerPaymentsController } from './payments.controller'
import { CustomerPaymentsService } from './payments.service'

@Module({
  imports: [MoneyModule],
  controllers: [CustomerPaymentsController, CustomersController],
  providers: [CustomersService, CustomerPaymentsService],
  exports: [CustomersService],
})
export class CustomersModule {}
