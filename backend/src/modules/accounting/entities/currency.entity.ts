import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Valyuta turi: nomi, belgisi va kodi */
@Entity('currencies')
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  name: string;

  /** Belgisi: $, €, ₽, so'm */
  @Column({ length: 10, nullable: true })
  symbol: string;

  /** ISO kodi: USD, EUR, UZS - takrorlanmaydi */
  @Column({ length: 3, unique: true })
  code: string;

  /**
   * Asosiy valyuta (so'm). Kurslar shunga nisbatan yoziladi, o'ziga kurs
   * kiritilmaydi va uni o'chirib bo'lmaydi.
   */
  @Column({ default: false })
  isBase: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
