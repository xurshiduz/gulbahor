import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Tashkilot va uning rekvizitlari - hujjatlar (nakladnoy, hisob-faktura) shundan to'ldiriladi */
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Qisqa nomi: "Gulbahor Tekstil" */
  @Column({ length: 160 })
  name: string;

  /** To'liq yuridik nomi: "GULBAHOR TEKSTIL" MChJ */
  @Column({ length: 255, nullable: true })
  fullName: string;

  /** STIR (INN) - 9 ta raqam */
  @Column({ length: 9, nullable: true })
  inn: string;

  /** QQS to'lovchisi ro'yxat kodi - 12 ta raqam */
  @Column({ length: 12, nullable: true })
  vatCode: string;

  /** IFUT (OKED) */
  @Column({ length: 10, nullable: true })
  oked: string;

  @Column({ length: 255, nullable: true })
  address: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 120, nullable: true })
  email: string;

  @Column({ length: 160, nullable: true })
  director: string;

  @Column({ length: 160, nullable: true })
  accountant: string;

  @Column({ length: 160, nullable: true })
  bankName: string;

  /** Hisob raqami - 20 ta raqam */
  @Column({ length: 20, nullable: true })
  bankAccount: string;

  /** Bank MFO - 5 ta raqam */
  @Column({ length: 5, nullable: true })
  mfo: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
