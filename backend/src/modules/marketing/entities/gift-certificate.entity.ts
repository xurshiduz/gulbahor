import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Contractor } from '../../contractors/entities/contractor.entity';

export enum CertificateStatus {
  NEW = 'NEW', // yaratilgan, hali sotilmagan
  SOLD = 'SOLD', // sotilgan - to'lovda ishlatish mumkin
  USED = 'USED', // to'liq ishlatilgan (qoldiq 0)
  CANCELLED = 'CANCELLED', // bekor qilingan
}

const numeric = { to: (value: number) => value, from: (value: string) => (value === null ? null : Number(value)) };

/** Sovg'a sertifikati: nominali bor, sotilgach to'lov vositasi sifatida ishlatiladi */
@Entity('gift_certificates')
export class GiftCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Sertifikat kodi - kartochkada yoziladi/skanerlanadi, takrorlanmaydi */
  @Column({ length: 32, unique: true })
  code: string;

  /** Nominal (so'm) */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  amount: number;

  /** Qoldiq - sotuvda ishlatilgani sari kamayadi */
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numeric })
  balance: number;

  /** Amal qilish muddati (YYYY-MM-DD, shu kun ham kiradi). Bo'sh - muddatsiz */
  @Column({ type: 'date', nullable: true })
  validUntil: string;

  @Column({ type: 'varchar', length: 20, default: CertificateStatus.NEW })
  status: CertificateStatus;

  @Column({ type: 'timestamp', nullable: true })
  soldAt: Date;

  /** Sotib olgan mijoz - ixtiyoriy */
  @Column({ type: 'uuid', nullable: true })
  customerId: string;

  @ManyToOne(() => Contractor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerId' })
  customer: Contractor;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
