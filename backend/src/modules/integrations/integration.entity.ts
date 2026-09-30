import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { numeric } from '../references/common/numeric';
import { User } from '../users/entities/user.entity';

/**
 * Integratsiya sozlamalari - har provayderga bitta qator. Kalitlar
 * (`credentials`) shu yerda, maxfiylari shifrlangan; .env da saqlanmaydi.
 */
@Entity('integration_settings')
export class IntegrationSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** PAYME, CLICK, UDS, ARCA, UZUM_PAY, UZUM_MARKET, WILDBERRIES, OZON */
  @Index({ unique: true })
  @Column({ length: 30 })
  provider: string;

  @Column({ default: false })
  isEnabled: boolean;

  /** Test (sandbox) rejimi - provayder test manzili ishlatiladi */
  @Column({ default: false })
  isTest: boolean;

  /** Kalitlar: { merchantId: '...', key: 'enc:v1:...' } */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  credentials: Record<string, string>;

  /**
   * Sozlamalar: to'lovda - qaysi to'lov turiga yoziladi (paymentTypeId);
   * marketpleysda - qaysi omborlarimiz, ularning ombori, moslash usuli,
   * zaxira va avtomatik yuborish oralig'i
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  options: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;

  /** OK / ERROR / PARTIAL */
  @Column({ length: 20, nullable: true })
  lastStatus: string;

  @Column({ type: 'text', nullable: true })
  lastMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Kassadagi integratsiyalashgan to'lov (Click, Payme, UDS, terminal).
 * Chek yopilganda sotuv hujjatiga bog'lanadi; bog'lanmagan to'langan
 * tranzaksiya - sotuv saqlanmay qolgan, qaytarish kerak.
 */
@Entity('integration_transactions')
export class IntegrationTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 30 })
  provider: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  /** So'mdagi summa (UDS da - yechilgan ball) */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  amount: number;

  /** Provayderdagi raqam: Click payment_id, Payme chek id, UDS operatsiya id */
  @Column({ length: 100, nullable: true })
  externalId: string;

  /** Terminal RRN / tranzaksiya raqami yoki buyurtma raqami */
  @Column({ length: 100, nullable: true })
  reference: string;

  @Column({ type: 'uuid', nullable: true })
  cashRegisterId: string;

  /** Chek yopilgach - qaysi sotuv hujjatiga */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  outboundDocumentId: string;

  @Column({ type: 'uuid', nullable: true })
  paymentId: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  /** Provayder javobi - muammoni aniqlash uchun */
  @Column({ type: 'jsonb', nullable: true })
  raw: any;

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

/** Integratsiya jurnali: ulanish tekshiruvi, qoldiq yuborish natijalari */
@Entity('integration_logs')
export class IntegrationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 30 })
  provider: string;

  /** TEST, SYNC */
  @Column({ length: 20 })
  action: string;

  /** OK, ERROR, PARTIAL */
  @Column({ length: 20 })
  status: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  details: any;

  @CreateDateColumn()
  createdAt: Date;
}
