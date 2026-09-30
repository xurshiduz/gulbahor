import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Currency } from '../../accounting/entities/currency.entity';
import { PaymentType } from '../../accounting/entities/payment-type.entity';
import { User } from '../../users/entities/user.entity';
import { numeric } from '../../references/common/numeric';
import { CashRegister } from './cash-register.entity';

/**
 * Kassadan olingan pul (inkassatsiya).
 *
 * Kim, qaysi kassirdan, qaysi kassadan, qancha va qaysi valyutada olib
 * ketgani. Pul to'liq olinmasligi mumkin - olingan paytdagi qoldiq va
 * kassada qolgani ham saqlanadi.
 */
@Entity('cash_withdrawals')
export class CashWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'timestamp' })
  withdrawnAt: Date;

  @Index()
  @Column({ type: 'uuid' })
  cashRegisterId: string;

  @ManyToOne(() => CashRegister, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashRegisterId' })
  cashRegister: CashRegister;

  @Column({ type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency;

  /** Naqd, karta... Bo'sh - to'lov turi ko'rsatilmagan pul */
  @Column({ type: 'uuid', nullable: true })
  paymentTypeId: string;

  @ManyToOne(() => PaymentType, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentTypeId' })
  paymentType: PaymentType;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  amount: number;

  /** Olishdan oldin kassada qancha bo'lgan */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  balanceBefore: number;

  /** Kassada qancha qoldirildi */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  balanceAfter: number;

  /** Kimdan olindi - kassada turgan kassir */
  @Column({ type: 'uuid', nullable: true })
  fromUserId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;

  /** Kim olib ketdi */
  @Column({ type: 'uuid', nullable: true })
  takenById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'takenById' })
  takenBy: User;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** Tizimga kim kiritdi */
  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;
}
