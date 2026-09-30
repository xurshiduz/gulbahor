import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Country } from '../../references/entities/country.entity';
import { Region } from '../../references/entities/region.entity';
import { Currency } from '../../accounting/entities/currency.entity';

/** Kontragent turi */
export enum ContractorType {
  CUSTOMER = 'CUSTOMER', // Mijoz
  SUPPLIER = 'SUPPLIER', // Yetkazib beruvchi
}

/** Yetkazib beruvchi turi - faqat SUPPLIER uchun */
export enum SupplierKind {
  LOCAL = 'LOCAL', // Mahalliy
  IMPORT = 'IMPORT', // Import (xorijiy)
}

/**
 * Kontragent: mijoz yoki yetkazib beruvchi. Ikkalasi bitta jadvalda -
 * rekvizitlari bir xil, hujjatlarda esa (kirim, chiqim, to'lov) bitta
 * bog'lanish bilan ishlatiladi.
 */
@Entity('contractors')
@Index(['type', 'supplierKind'])
export class Contractor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: ContractorType;

  /** Mahalliy yoki import - faqat yetkazib beruvchida, mijozda null */
  @Column({ type: 'varchar', length: 20, nullable: true })
  supplierKind: SupplierKind;

  @Column({ length: 160 })
  name: string;

  /** To'liq yuridik nomi */
  @Column({ length: 255, nullable: true })
  fullName: string;

  /** STIR (INN) - 9 ta raqam; xorijiy yetkazib beruvchida bo'lmaydi */
  @Column({ length: 9, nullable: true })
  inn: string;

  /** Aloqa uchun shaxs */
  @Column({ length: 160, nullable: true })
  contactPerson: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 120, nullable: true })
  email: string;

  /** Tug'ilgan kun (YYYY-MM-DD) - mijozda majburiy, yetkazib beruvchida ishlatilmaydi */
  @Column({ type: 'date', nullable: true })
  birthDate: string;

  /** Davlat - import yetkazib beruvchi uchun majburiy */
  @Column({ type: 'uuid', nullable: true })
  countryId: string;

  @ManyToOne(() => Country, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'countryId' })
  country: Country;

  /** Viloyat - mijoz va mahalliy yetkazib beruvchi uchun */
  @Column({ type: 'uuid', nullable: true })
  regionId: string;

  @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'regionId' })
  region: Region;

  @Column({ length: 255, nullable: true })
  address: string;

  /** Hisob-kitob valyutasi (import yetkazib beruvchi bilan odatda USD) */
  @Column({ type: 'uuid', nullable: true })
  currencyId: string;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency;

  @Column({ length: 160, nullable: true })
  bankName: string;

  /** Hisob raqami - xorijiy bankda IBAN bo'lishi mumkin, shuning uchun uzunroq */
  @Column({ length: 34, nullable: true })
  bankAccount: string;

  /** MFO (mahalliy) yoki SWIFT (xorijiy) */
  @Column({ length: 11, nullable: true })
  bankCode: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
