import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Contractor } from '../../contractors/entities/contractor.entity';
import { InboundDocument } from '../../inbound-documents/entities/inbound-document.entity';
import { User } from '../../users/entities/user.entity';
import { numeric } from '../../references/common/numeric';
import { Currency } from './currency.entity';
import { ExpenseTarget, ExpenseType } from './expense-type.entity';
import { PaymentType } from './payment-type.entity';

/**
 * To'lov (harajat).
 *
 * Harajat turi to'lov nimaga bog'lanishini belgilaydi: kirim hujjatiga,
 * yetkazib beruvchiga, mijozga yoki hech nimaga (umumiy harajat).
 *
 * Summa to'lov valyutasida yoziladi. So'mdan boshqa valyutada kurs va
 * so'mdagi summa ham saqlanadi - kurs keyin o'zgarsa ham to'lov qancha
 * so'm bo'lgani o'zgarmaydi.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'date' })
  paymentDate: string;

  @Column({ type: 'uuid' })
  expenseTypeId: string;

  @ManyToOne(() => ExpenseType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expenseTypeId' })
  expenseType: ExpenseType;

  /** Harajat turidagi bog'lanish - to'lov yozilgan paytdagi holati */
  @Column({ type: 'varchar', length: 20, default: ExpenseTarget.NONE })
  target: ExpenseTarget;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  inboundDocumentId: string;

  @ManyToOne(() => InboundDocument, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inboundDocumentId' })
  inboundDocument: InboundDocument;

  /** Yetkazib beruvchi yoki mijoz. Kirim hujjatiga to'lovda - hujjatdagi kontragent */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  contractorId: string;

  @ManyToOne(() => Contractor, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contractorId' })
  contractor: Contractor;

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

  /** To'lov valyutasidagi summa */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  amount: number;

  /** 1 valyuta = `rate` so'm. So'mdagi to'lovda 1 */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 1, transformer: numeric })
  rate: number;

  /** So'mdagi summa. So'mdagi to'lovda `amount` bilan bir xil */
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
