import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { PaymentType } from './entities/payment-type.entity';
import { ExpenseType } from './entities/expense-type.entity';

const CURRENCIES = [
  { name: "O'zbek so'mi", symbol: "so'm", code: 'UZS', isBase: true },
  { name: 'AQSH dollari', symbol: '$', code: 'USD' },
  { name: 'Yevro', symbol: '€', code: 'EUR' },
  { name: 'Rossiya rubli', symbol: '₽', code: 'RUB' },
  { name: 'Xitoy yuani', symbol: '¥', code: 'CNY' },
];

const PAYMENT_TYPES = ['Naqd pul', 'Plastik karta', "Bank o'tkazmasi", 'Click', 'Payme'];

const EXPENSE_TYPES = [
  'Ijara', 'Ish haqi', 'Transport va yetkazib berish', 'Kommunal xizmatlar', 'Soliqlar', 'Reklama', 'Boshqa harajatlar',
];

/**
 * Buhgalteriya ma'lumotnomalarining boshlang'ich qiymatlari. Har bir jadval
 * faqat bo'sh bo'lganda to'ldiriladi. Valyuta kurslari kiritilmaydi -
 * ularni foydalanuvchi o'zi yozadi.
 */
@Injectable()
export class AccountingSeedService {
  private readonly logger = new Logger(AccountingSeedService.name);

  constructor(
    @InjectRepository(Currency) private readonly currencies: Repository<Currency>,
    @InjectRepository(PaymentType) private readonly paymentTypes: Repository<PaymentType>,
    @InjectRepository(ExpenseType) private readonly expenseTypes: Repository<ExpenseType>,
  ) {}

  async seed() {
    if (!(await this.currencies.count())) {
      await this.currencies.save(CURRENCIES);
      this.logger.log(`Valyutalar: ${CURRENCIES.length} ta`);
    }
    if (!(await this.paymentTypes.count())) {
      await this.paymentTypes.save(PAYMENT_TYPES.map((name) => ({ name })));
      this.logger.log(`To'lov turlari: ${PAYMENT_TYPES.length} ta`);
    }
    if (!(await this.expenseTypes.count())) {
      await this.expenseTypes.save(EXPENSE_TYPES.map((name) => ({ name })));
      this.logger.log(`Harajat turlari: ${EXPENSE_TYPES.length} ta`);
    }
  }
}
