import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Harajat (to'lov) nimaga bog'lanadi */
export enum ExpenseTarget {
  /** Umumiy harajat: ijara, ish haqi... */
  NONE = 'NONE',
  /** Kirim hujjatiga: to'lovda hujjat tanlanadi */
  INBOUND_DOCUMENT = 'INBOUND_DOCUMENT',
  /** Yetkazib beruvchiga: to'lovda yetkazib beruvchi tanlanadi */
  SUPPLIER = 'SUPPLIER',
  /** Mijozga: to'lovda mijoz tanlanadi */
  CUSTOMER = 'CUSTOMER',
}

/** Harajat turi: ijara, ish haqi, transport... */
@Entity('expense_types')
export class ExpenseType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  /** Shu turdagi to'lov nimaga yoziladi */
  @Column({ type: 'varchar', length: 20, default: ExpenseTarget.NONE })
  target: ExpenseTarget;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
