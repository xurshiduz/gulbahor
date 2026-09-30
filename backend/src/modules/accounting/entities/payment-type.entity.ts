import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** To'lov turi: naqd, plastik karta, bank o'tkazmasi... */
@Entity('payment_types')
export class PaymentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * Naqd pul. Kassada "Naqd - so'm" va "Naqd - valyuta" shu turga yoziladi;
   * bunday tur bittagina bo'ladi.
   */
  @Column({ default: false })
  isCash: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
