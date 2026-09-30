import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashWithdrawal } from './entities/cash-withdrawal.entity';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { PaymentType } from '../accounting/entities/payment-type.entity';
import { User } from '../users/entities/user.entity';
import { CashRegistersService } from './cash-registers.service';
import { CashBalanceService } from './cash-balance.service';
import { CashWithdrawalsService } from './cash-withdrawals.service';
import { CashBalanceController, CashRegistersController, CashWithdrawalsController } from './cash.controllers';

/** Kassalar, kassadagi qoldiq va kassadan olingan pul */
@Module({
  imports: [TypeOrmModule.forFeature([CashRegister, CashWithdrawal, Branch, Warehouse, Currency, PaymentType, User])],
  providers: [CashRegistersService, CashBalanceService, CashWithdrawalsService],
  controllers: [CashRegistersController, CashBalanceController, CashWithdrawalsController],
  exports: [CashRegistersService, CashBalanceService],
})
export class CashModule {}
