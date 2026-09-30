import { Column, CreateDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Branch } from '../../administration/entities/branch.entity';
import { Warehouse } from '../../administration/entities/warehouse.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Kassa. Bitta filialda bir nechta kassa bo'ladi, har birida o'z
 * kassirlari ishlaydi.
 *
 * Pul harakati (sotuvdan tushum, harajat, kassadan olingan pul) doim
 * kassaga yoziladi - kassadagi qoldiq shundan hisoblanadi. Kassadagi
 * sotuvda tovar kassaning omboridan chiqadi.
 */
@Entity('cash_registers')
export class CashRegister {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  /** Kassada sotilgan tovar shu ombordan chiqadi */
  @Column({ type: 'uuid', nullable: true })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  /**
   * Kassirlar - shu kassada ishlaydigan xodimlar. Bo'sh bo'lsa kassa
   * hammaga ochiq; administratorlar hamma kassani ko'radi.
   */
  @ManyToMany(() => User)
  @JoinTable({ name: 'cash_register_users', joinColumn: { name: 'cashRegisterId' }, inverseJoinColumn: { name: 'userId' } })
  users: User[];

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
