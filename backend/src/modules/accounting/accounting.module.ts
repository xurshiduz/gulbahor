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
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './services/payments.service';
import { PaymentsController } from './controllers/payments.controller';
import { Contractor } from '../contractors/entities/contractor.entity';
import { InboundDocument } from '../inbound-documents/entities/inbound-document.entity';
import { OutboundDocument } from '../outbound-documents/entities/outbound-document.entity';
import { CashRegister } from '../cash/entities/cash-register.entity';
import { CashModule } from '../cash/cash.module';
import { AccountingSeedService } from './accounting-seed.service';

/** Buhgalteriya: valyutalar va kurslar, to'lov va harajat turlari, harajatlar va pul tushumlari */
@Module({
  imports: [
    TypeOrmModule.forFeature([Currency, CurrencyRate, PaymentType, ExpenseType, Payment, Contractor, InboundDocument, OutboundDocument, CashRegister]),
    // Pul harakati kassaga yoziladi - kassaga ruxsat shu yerdan tekshiriladi
    CashModule,
  ],
  providers: [CurrenciesService, CurrencyRatesService, PaymentTypesService, ExpenseTypesService, PaymentsService, AccountingSeedService],
  controllers: [CurrenciesController, CurrencyRatesController, PaymentTypesController, ExpenseTypesController, PaymentsController],
  exports: [CurrenciesService, CurrencyRatesService, PaymentTypesService, ExpenseTypesService, PaymentsService, AccountingSeedService],
})
export class AccountingModule {}
