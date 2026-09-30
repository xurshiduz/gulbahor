import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { INCOME_FROM_CONTRACTOR, INCOME_FROM_DOCUMENT, Payment, PaymentDirection } from '../entities/payment.entity';
import { ExpenseTarget, ExpenseType } from '../entities/expense-type.entity';
import { PaymentType } from '../entities/payment-type.entity';
import { Currency } from '../entities/currency.entity';
import { CurrencyRate } from '../entities/currency-rate.entity';
import { Contractor, ContractorType } from '../../contractors/entities/contractor.entity';
import { InboundDocument } from '../../inbound-documents/entities/inbound-document.entity';
import { OutboundDocument } from '../../outbound-documents/entities/outbound-document.entity';
import { PaymentDto } from '../dto/accounting.dto';
import { roundMoney } from '../../references/common/numeric';
import { today } from './currencies.service';
import { CashRegistersService } from '../../cash/cash-registers.service';

const RELATIONS = {
  expenseType: true, inboundDocument: true, outboundDocument: true, contractor: true,
  paymentType: true, currency: true, createdBy: true, cashRegister: { branch: true },
} as const;

/**
 * Harajatlar (pul chiqimi) va pul tushumlari - bitta jadval, `direction`
 * bilan ajratiladi.
 *
 * Harajatda bog'lanishni harajat turi belgilaydi. Tushumda pul yo chiqim
 * (sotuv) hujjati bo'yicha, yo to'g'ridan-to'g'ri kontragentdan keladi.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    @InjectRepository(ExpenseType) private readonly expenseTypeRepo: Repository<ExpenseType>,
    @InjectRepository(PaymentType) private readonly paymentTypeRepo: Repository<PaymentType>,
    @InjectRepository(Currency) private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(CurrencyRate) private readonly rateRepo: Repository<CurrencyRate>,
    @InjectRepository(Contractor) private readonly contractorRepo: Repository<Contractor>,
    @InjectRepository(InboundDocument) private readonly inboundRepo: Repository<InboundDocument>,
    @InjectRepository(OutboundDocument) private readonly outboundRepo: Repository<OutboundDocument>,
    private readonly cashRegisters: CashRegistersService,
  ) {}

  /** Jadval uchun: bog'langan yozuvlardan faqat kerakli maydonlar */
  private view(payment: Payment) {
    const { expenseType, inboundDocument, outboundDocument, contractor, paymentType, currency, createdBy, cashRegister, ...rest } = payment;
    const document = (row?: { id: string; documentNumber: string; documentDate: string } | null) =>
      (row ? { id: row.id, documentNumber: row.documentNumber, documentDate: row.documentDate } : null);
    return {
      ...rest,
      expenseType: expenseType ? { id: expenseType.id, name: expenseType.name } : null,
      inboundDocument: document(inboundDocument),
      outboundDocument: document(outboundDocument),
      contractor: contractor ? { id: contractor.id, name: contractor.name, type: contractor.type } : null,
      paymentType: paymentType ? { id: paymentType.id, name: paymentType.name } : null,
      currency: currency ? { id: currency.id, code: currency.code, isBase: currency.isBase } : null,
      createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null,
      cashRegister: cashRegister ? { id: cashRegister.id, name: cashRegister.name, branchName: cashRegister.branch?.name || null } : null,
    };
  }

  async findAll(direction: PaymentDirection) {
    const payments = await this.repo.find({
      where: { direction },
      relations: RELATIONS,
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });
    return payments.map((payment) => this.view(payment));
  }

  async findOne(id: string) {
    const payment = await this.repo.findOne({ where: { id }, relations: RELATIONS });
    if (!payment) throw new NotFoundException('Yozuv topilmadi');
    return this.view(payment);
  }

  async create(dto: PaymentDto, user?: any) {
    const data = await this.prepare(dto, undefined, user);
    const payment = await this.repo.save(this.repo.create({ ...data, createdById: user?.id || null }));
    return this.findOne(payment.id);
  }

  async update(id: string, dto: PaymentDto, user?: any) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Yozuv topilmadi');
    // Turi (harajat / tushum) o'zgarmaydi - saqlangani qoladi
    await this.repo.update(id, await this.prepare({ ...dto, direction: existing.direction }, existing, user));
    return this.findOne(id);
  }

  async remove(id: string) {
    const payment = await this.repo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('Yozuv topilmadi');
    await this.repo.remove(payment);
    return { success: true };
  }

  /** Tekshiradi va saqlashga tayyorlaydi: bog'lanish turga qarab, so'mdagi summa kursdan */
  private async prepare(dto: PaymentDto, existing?: Payment, user?: any): Promise<Partial<Payment>> {
    const direction = dto.direction || PaymentDirection.EXPENSE;

    // Kassa: yangi yozuvda yoki kassa almashtirilsa - xodim shu kassada ishlay olishi kerak
    if (!dto.cashRegisterId) throw new BadRequestException('Kassa tanlanishi shart');
    if (!existing || existing.cashRegisterId !== dto.cashRegisterId) {
      await this.cashRegisters.assertAccess(dto.cashRegisterId, user);
    }
    const link = direction === PaymentDirection.INCOME ? await this.incomeLink(dto) : await this.expenseLink(dto, existing);

    let paymentTypeId: string | null = null;
    if (dto.paymentTypeId) {
      const paymentType = await this.paymentTypeRepo.findOne({ where: { id: dto.paymentTypeId } });
      if (!paymentType) throw new NotFoundException('To`lov turi topilmadi');
      paymentTypeId = paymentType.id;
    }

    const currency = await this.currencyRepo.findOne({ where: { id: dto.currencyId } });
    if (!currency) throw new NotFoundException('Valyuta topilmadi');

    const paymentDate = dto.paymentDate || existing?.paymentDate || today();
    if (Number.isNaN(Date.parse(paymentDate))) throw new BadRequestException('Sana notog`ri');

    // So'mda kurs kerak emas; boshqa valyutada kurs shart va so'mdagi summa ham saqlanadi
    let rate = 1;
    let amountUzs = dto.amount;
    if (!currency.isBase) {
      if (!(dto.rate > 0)) throw new BadRequestException(`${currency.code} uchun kurs kiritilishi shart`);
      rate = dto.rate;
      amountUzs = dto.amountUzs > 0 ? dto.amountUzs : roundMoney(dto.amount * rate);
    }

    return {
      direction,
      paymentDate,
      cashRegisterId: dto.cashRegisterId,
      ...link,
      paymentTypeId,
      currencyId: currency.id,
      amount: dto.amount,
      rate,
      amountUzs,
      description: String(dto.description || '').trim() || null,
    };
  }

  /** Harajat: bog'lanishni harajat turi belgilaydi */
  private async expenseLink(dto: PaymentDto, existing?: Payment) {
    const expenseType = await this.expenseTypeRepo.findOne({ where: { id: dto.expenseTypeId || '' } });
    if (!expenseType) throw new NotFoundException('Harajat turi topilmadi');
    if (!expenseType.isActive && existing?.expenseTypeId !== expenseType.id) {
      throw new BadRequestException('Bu harajat turi faol emas');
    }

    const target = expenseType.target || ExpenseTarget.NONE;
    const link = { expenseTypeId: expenseType.id, target, inboundDocumentId: null, outboundDocumentId: null, contractorId: null as string | null };

    if (target === ExpenseTarget.INBOUND_DOCUMENT) {
      if (!dto.inboundDocumentId) throw new BadRequestException('Kirim hujjati tanlanishi shart');
      const document = await this.inboundRepo.findOne({ where: { id: dto.inboundDocumentId } });
      if (!document) throw new NotFoundException('Kirim hujjati topilmadi');
      return { ...link, inboundDocumentId: document.id, contractorId: document.contractorId };
    }
    if (target === ExpenseTarget.SUPPLIER || target === ExpenseTarget.CUSTOMER) {
      const isSupplier = target === ExpenseTarget.SUPPLIER;
      if (!dto.contractorId) throw new BadRequestException(isSupplier ? 'Yetkazib beruvchi tanlanishi shart' : 'Mijoz tanlanishi shart');
      const contractor = await this.contractorRepo.findOne({
        where: { id: dto.contractorId, type: isSupplier ? ContractorType.SUPPLIER : ContractorType.CUSTOMER },
      });
      if (!contractor) throw new NotFoundException(isSupplier ? 'Yetkazib beruvchi topilmadi' : 'Mijoz topilmadi');
      return { ...link, contractorId: contractor.id };
    }
    return link;
  }

  /** Tushum: chiqim hujjati bo'yicha yoki kontragentdan */
  private async incomeLink(dto: PaymentDto) {
    const link = { expenseTypeId: null, inboundDocumentId: null, outboundDocumentId: null as string | null, contractorId: null as string | null };

    if (dto.outboundDocumentId) {
      const document = await this.outboundRepo.findOne({ where: { id: dto.outboundDocumentId } });
      if (!document) throw new NotFoundException('Chiqim hujjati topilmadi');
      // Kontragent hujjatdan olinadi - chek kimga sotilgan bo'lsa
      return { ...link, target: INCOME_FROM_DOCUMENT, outboundDocumentId: document.id, contractorId: document.customerId || null };
    }
    if (!dto.contractorId) throw new BadRequestException('Chiqim hujjati yoki kontragent tanlanishi shart');
    const contractor = await this.contractorRepo.findOne({ where: { id: dto.contractorId } });
    if (!contractor) throw new NotFoundException('Kontragent topilmadi');
    return { ...link, target: INCOME_FROM_CONTRACTOR, contractorId: contractor.id };
  }

  /** Sanadagi amaldagi kurs: shu kungacha kiritilgan oxirgisi. Forma kursni shundan to'ldiradi */
  async rateFor(currencyId: string, date?: string) {
    const currency = await this.currencyRepo.findOne({ where: { id: currencyId } });
    if (!currency) throw new NotFoundException('Valyuta topilmadi');
    if (currency.isBase) return { rate: 1, date: null };

    const onDate = date && !Number.isNaN(Date.parse(date)) ? date : today();
    const found = await this.rateRepo.findOne({ where: { currencyId, date: LessThanOrEqual(onDate) }, order: { date: 'DESC' } });
    return { rate: found ? found.rate : null, date: found ? found.date : null };
  }

  /**
   * Forma tanlovlari bitta so'rovda: harajat va to'lov turlari, valyutalar,
   * kontragentlar, kirim va chiqim hujjatlari. Shu tufayli kirituvchiga bu
   * ma'lumotnomalarning har biriga alohida huquq kerak emas.
   */
  async options(user?: any) {
    const [expenseTypes, paymentTypes, currencies, contractors, inbound, outbound, cashRegisters] = await Promise.all([
      this.expenseTypeRepo.find({ order: { name: 'ASC' } }),
      this.paymentTypeRepo.find({ order: { name: 'ASC' } }),
      this.currencyRepo.find({ order: { isBase: 'DESC', code: 'ASC' } }),
      this.contractorRepo.find({ order: { name: 'ASC' } }),
      this.inboundRepo.find({ relations: { contractor: true, currency: true, items: true }, order: { documentDate: 'DESC', createdAt: 'DESC' } }),
      this.outboundRepo.find({ relations: { customer: true, items: true }, order: { documentDate: 'DESC', createdAt: 'DESC' } }),
      this.cashRegisters.availableFor(user, false),
    ]);
    const contractor = (row: Contractor) => ({ id: row.id, name: row.name, phone: row.phone, currencyId: row.currencyId, isActive: row.isActive });
    const amount = (items: { quantity: number; price: number }[]) => roundMoney(items.reduce((sum, item) => sum + item.quantity * item.price, 0));

    return {
      cashRegisters: cashRegisters.map((row) => ({ id: row.id, name: row.name, branchName: row.branch?.name || null, isActive: row.isActive })),
      expenseTypes: expenseTypes.map((row) => ({ id: row.id, name: row.name, target: row.target, isActive: row.isActive })),
      paymentTypes: paymentTypes.map((row) => ({ id: row.id, name: row.name, isActive: row.isActive })),
      currencies: currencies.map((row) => ({ id: row.id, code: row.code, name: row.name, isBase: row.isBase, isActive: row.isActive })),
      suppliers: contractors.filter((row) => row.type === ContractorType.SUPPLIER).map(contractor),
      customers: contractors.filter((row) => row.type === ContractorType.CUSTOMER).map(contractor),
      inboundDocuments: inbound.map((document) => ({
        id: document.id,
        documentNumber: document.documentNumber,
        documentDate: document.documentDate,
        type: document.type,
        contractorName: document.contractor?.name || null,
        currencyId: document.currencyId,
        currencyCode: document.currency?.code || null,
        totalAmount: amount(document.items),
      })),
      outboundDocuments: outbound.map((document) => ({
        id: document.id,
        documentNumber: document.documentNumber,
        documentDate: document.documentDate,
        status: document.status,
        contractorId: document.customerId,
        contractorName: document.customer?.name || null,
        totalAmount: amount(document.items),
      })),
    };
  }
}
