import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Contractor } from '../../contractors/entities/contractor.entity';
import { InboundDocument } from '../../inbound-documents/entities/inbound-document.entity';
import { OutboundDocument } from '../../outbound-documents/entities/outbound-document.entity';
import { User } from '../../users/entities/user.entity';
import { numeric } from '../../references/common/numeric';
import { Currency } from './currency.entity';
import { ExpenseTarget, ExpenseType } from './expense-type.entity';
import { PaymentType } from './payment-type.entity';
import { CashRegister } from '../../cash/entities/cash-register.entity';

/** Pul chiqdimi yoki tushdimi */
export enum PaymentDirection {
  /** Harajat - pul chiqdi */
  EXPENSE = 'EXPENSE',
  /** Pul tushumi - pul tushdi */
  INCOME = 'INCOME',
}

/**
 * Tushum manbasi (`target` ustunida saqlanadi - harajatda u yerda
 * `ExpenseTarget` turadi).
 */
export const INCOME_FROM_DOCUMENT = 'OUTBOUND_DOCUMENT';
export const INCOME_FROM_CONTRACTOR = 'CONTRACTOR';

/**
 * Harajat va pul tushumi.
 *
 * Harajatda harajat turi to'lov nimaga bog'lanishini belgilaydi: kirim
 * hujjatiga, yetkazib beruvchiga, mijozga yoki hech nimaga.
 * Tushumda pul qaysi chiqim (sotuv) hujjati bo'yicha yoki qaysi
 * kontragentdan kelgani ko'rsatiladi.
 *
 * Summa o'z valyutasida yoziladi. So'mdan boshqa valyutada kurs va
 * so'mdagi summa ham saqlanadi - kurs keyin o'zgarsa ham qancha so'm
 * bo'lgani o'zgarmaydi.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: PaymentDirection.EXPENSE })
  direction: PaymentDirection;

  @Index()
  @Column({ type: 'date' })
  paymentDate: string;

  /** Faqat harajatda */
  @Column({ type: 'uuid', nullable: true })
  expenseTypeId: string;

  @ManyToOne(() => ExpenseType, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expenseTypeId' })
  expenseType: ExpenseType;

  /** Harajatda - harajat turidagi bog'lanish; tushumda - manba */
  @Column({ type: 'varchar', length: 20, default: ExpenseTarget.NONE })
  target: string;

  /** Harajat: qaysi kirim hujjati uchun to'landi */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  inboundDocumentId: string;

  @ManyToOne(() => InboundDocument, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inboundDocumentId' })
  inboundDocument: InboundDocument;

  /** Tushum: qaysi sotuv bo'yicha pul tushdi */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  outboundDocumentId: string;

  @ManyToOne(() => OutboundDocument, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'outboundDocumentId' })
  outboundDocument: OutboundDocument;

  /** Kimga to'landi / kimdan tushdi. Hujjat tanlansa - hujjatdagi kontragent */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  contractorId: string;

  @ManyToOne(() => Contractor, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contractorId' })
  contractor: Contractor;

  /** Pul qaysi kassaga tushdi / qaysi kassadan chiqdi */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  cashRegisterId: string;

  @ManyToOne(() => CashRegister, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashRegisterId' })
  cashRegister: CashRegister;

  /** Naqd, karta, o'tkazma... */
  @Column({ type: 'uuid', nullable: true })
  paymentTypeId: string;

  @ManyToOne(() => PaymentType, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentTypeId' })
  paymentType: PaymentType;

  @Column({ type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency;

  /** O'z valyutasidagi summa */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  amount: number;

  /** 1 valyuta = `rate` so'm. So'mda 1 */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 1, transformer: numeric })
  rate: number;

  /** So'mdagi summa. So'mda `amount` bilan bir xil */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  amountUzs: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
