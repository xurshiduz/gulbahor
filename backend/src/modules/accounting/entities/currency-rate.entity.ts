import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Currency } from './currency.entity';

/**
 * Valyuta kursi: shu sanadan boshlab 1 birlik valyuta necha so'm.
 * Bitta valyutaga bitta sanada bitta kurs bo'ladi.
 */
@Entity('currency_rates')
@Unique(['currencyId', 'date'])
export class CurrencyRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency;

  /** Kurs kuchga kirgan sana (YYYY-MM-DD) */
  @Column({ type: 'date' })
  date: string;

  /** 1 valyuta = `rate` so'm. numeric ustun satr bo'lib o'qiladi - songa aylantiramiz */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: { to: (value: number) => value, from: (value: string) => (value === null ? null : Number(value)) },
  })
  rate: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
