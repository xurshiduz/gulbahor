import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { CurrencyRate } from './entities/currency-rate.entity';
import { PaymentType } from './entities/payment-type.entity';
import { ExpenseType } from './entities/expense-type.entity';
import { CurrenciesService } from './services/currencies.service';
import { CurrencyRatesService } from './services/currency-rates.service';
import { PaymentTypesService } from './services/payment-types.service';
import { ExpenseTypesService } from './services/expense-types.service';
import { CurrenciesController } from './controllers/currencies.controller';
import { CurrencyRatesController } from './controllers/currency-rates.controller';
import { PaymentTypesController } from './controllers/payment-types.controller';
import { ExpenseTypesController } from './controllers/expense-types.controller';
import { AccountingSeedService } from './accounting-seed.service';

/** Buhgalteriya: valyuta turlari, valyuta kurslari, to'lov turlari, harajat turlari */
@Module({
  imports: [TypeOrmModule.forFeature([Currency, CurrencyRate, PaymentType, ExpenseType])],
  providers: [CurrenciesService, CurrencyRatesService, PaymentTypesService, ExpenseTypesService, AccountingSeedService],
  controllers: [CurrenciesController, CurrencyRatesController, PaymentTypesController, ExpenseTypesController],
  exports: [CurrenciesService, CurrencyRatesService, PaymentTypesService, ExpenseTypesService, AccountingSeedService],
})
export class AccountingModule {}
