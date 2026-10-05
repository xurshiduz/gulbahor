import { Module } from '@nestjs/common'

import { MoneyModule } from '../money/money.module'
import { CustomersController } from './customers.controller'
import { CustomersService } from './customers.service'
import { CustomerDebtsController } from './debts.controller'
import { CustomerDebtsService } from './debts.service'

@Module({
  imports: [MoneyModule],
  controllers: [CustomerDebtsController, CustomersController],
  providers: [CustomersService, CustomerDebtsService],
  exports: [CustomersService],
})
export class CustomersModule {}
