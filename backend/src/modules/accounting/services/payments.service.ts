import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';
import { ExpenseTarget, ExpenseType } from '../entities/expense-type.entity';
import { PaymentType } from '../entities/payment-type.entity';
import { Currency } from '../entities/currency.entity';
import { CurrencyRate } from '../entities/currency-rate.entity';
import { Contractor, ContractorType } from '../../contractors/entities/contractor.entity';
import { InboundDocument } from '../../inbound-documents/entities/inbound-document.entity';
import { PaymentDto } from '../dto/accounting.dto';
import { roundMoney } from '../../references/common/numeric';
import { today } from './currencies.service';

const RELATIONS = { expenseType: true, inboundDocument: true, contractor: true, paymentType: true, currency: true, createdBy: true } as const;

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
  ) {}

  /** Jadval uchun: bog'langan yozuvlardan faqat kerakli maydonlar */
  private view(payment: Payment) {
    const { expenseType, inboundDocument, contractor, paymentType, currency, createdBy, ...rest } = payment;
    return {
      ...rest,
      expenseType: expenseType ? { id: expenseType.id, name: expenseType.name } : null,
      inboundDocument: inboundDocument ? { id: inboundDocument.id, documentNumber: inboundDocument.documentNumber, documentDate: inboundDocument.documentDate } : null,
      contractor: contractor ? { id: contractor.id, name: contractor.name, type: contractor.type } : null,
      paymentType: paymentType ? { id: paymentType.id, name: paymentType.name } : null,
      currency: currency ? { id: currency.id, code: currency.code, isBase: currency.isBase } : null,
      createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null,
    };
  }

  async findAll() {
    const payments = await this.repo.find({ relations: RELATIONS, order: { paymentDate: 'DESC', createdAt: 'DESC' } });
    return payments.map((payment) => this.view(payment));
  }

  async findOne(id: string) {
    const payment = await this.repo.findOne({ where: { id }, relations: RELATIONS });
    if (!payment) throw new NotFoundException('To`lov topilmadi');
    return this.view(payment);
  }

  async create(dto: PaymentDto, userId?: string) {
    const data = await this.prepare(dto);
    const payment = await this.repo.save(this.repo.create({ ...data, createdById: userId || null }));
    return this.findOne(payment.id);
  }

  async update(id: string, dto: PaymentDto) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('To`lov topilmadi');
    await this.repo.update(id, await this.prepare(dto, existing));
    return this.findOne(id);
  }

  async remove(id: string) {
    const payment = await this.repo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('To`lov topilmadi');
    await this.repo.remove(payment);
    return { success: true };
  }

  /** To'lovni tekshiradi va saqlashga tayyorlaydi: bog'lanish harajat turidan, so'mdagi summa kursdan */
  private async prepare(dto: PaymentDto, existing?: Payment): Promise<Partial<Payment>> {
    const expenseType = await this.expenseTypeRepo.findOne({ where: { id: dto.expenseTypeId } });
    if (!expenseType) throw new NotFoundException('Harajat turi topilmadi');
    if (!expenseType.isActive && existing?.expenseTypeId !== expenseType.id) {
      throw new BadRequestException('Bu harajat turi faol emas');
    }

    const target = expenseType.target || ExpenseTarget.NONE;
    let inboundDocumentId: string | null = null;
    let contractorId: string | null = null;

    if (target === ExpenseTarget.INBOUND_DOCUMENT) {
      if (!dto.inboundDocumentId) throw new BadRequestException('Kirim hujjati tanlanishi shart');
      const document = await this.inboundRepo.findOne({ where: { id: dto.inboundDocumentId } });
      if (!document) throw new NotFoundException('Kirim hujjati topilmadi');
      inboundDocumentId = document.id;
      contractorId = document.contractorId;
    } else if (target === ExpenseTarget.SUPPLIER || target === ExpenseTarget.CUSTOMER) {
      const isSupplier = target === ExpenseTarget.SUPPLIER;
      if (!dto.contractorId) throw new BadRequestException(isSupplier ? 'Yetkazib beruvchi tanlanishi shart' : 'Mijoz tanlanishi shart');
      const contractor = await this.contractorRepo.findOne({
        where: { id: dto.contractorId, type: isSupplier ? ContractorType.SUPPLIER : ContractorType.CUSTOMER },
      });
      if (!contractor) throw new NotFoundException(isSupplier ? 'Yetkazib beruvchi topilmadi' : 'Mijoz topilmadi');
      contractorId = contractor.id;
    }

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
      paymentDate,
      expenseTypeId: expenseType.id,
      target,
      inboundDocumentId,
      contractorId,
      paymentTypeId,
      currencyId: currency.id,
      amount: dto.amount,
      rate,
      amountUzs,
      description: String(dto.description || '').trim() || null,
    };
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
   * To'lov formasidagi tanlovlar bitta so'rovda: harajat va to'lov turlari,
   * valyutalar, kontragentlar va kirim hujjatlari. Shu tufayli to'lov
   * kirituvchiga bu ma'lumotnomalarning har biriga alohida huquq kerak emas.
   */
  async options() {
    const [expenseTypes, paymentTypes, currencies, contractors, documents] = await Promise.all([
      this.expenseTypeRepo.find({ order: { name: 'ASC' } }),
      this.paymentTypeRepo.find({ order: { name: 'ASC' } }),
      this.currencyRepo.find({ order: { isBase: 'DESC', code: 'ASC' } }),
      this.contractorRepo.find({ order: { name: 'ASC' } }),
      this.inboundRepo.find({
        relations: { contractor: true, currency: true, items: true },
        order: { documentDate: 'DESC', createdAt: 'DESC' },
      }),
    ]);
    const contractor = (row: Contractor) => ({ id: row.id, name: row.name, phone: row.phone, currencyId: row.currencyId, isActive: row.isActive });

    return {
      expenseTypes: expenseTypes.map((row) => ({ id: row.id, name: row.name, target: row.target, isActive: row.isActive })),
      paymentTypes: paymentTypes.map((row) => ({ id: row.id, name: row.name, isActive: row.isActive })),
      currencies: currencies.map((row) => ({ id: row.id, code: row.code, name: row.name, isBase: row.isBase, isActive: row.isActive })),
      suppliers: contractors.filter((row) => row.type === ContractorType.SUPPLIER).map(contractor),
      customers: contractors.filter((row) => row.type === ContractorType.CUSTOMER).map(contractor),
      inboundDocuments: documents.map((document) => ({
        id: document.id,
        documentNumber: document.documentNumber,
        documentDate: document.documentDate,
        type: document.type,
        contractorName: document.contractor?.name || null,
        currencyId: document.currencyId,
        currencyCode: document.currency?.code || null,
        totalAmount: roundMoney(document.items.reduce((sum, item) => sum + item.quantity * item.price, 0)),
      })),
    };
  }
}
