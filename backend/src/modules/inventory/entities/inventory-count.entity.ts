import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Branch } from '../../administration/entities/branch.entity';
import { Warehouse } from '../../administration/entities/warehouse.entity';
import { User } from '../../users/entities/user.entity';

export enum InventoryStatus {
  /** Rejalashtirilgan - hali sanash boshlanmagan */
  PLANNED = 'PLANNED',
  /** Sanalmoqda - skaner qabul qilinadi */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Tugatilgan - hisobot qotirilgan */
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Inventarizatsiya: qaysi filial va omborda, qaysi sanalarda, kim mas'ul.
 * Sanash RFID skaner (yoki shtrix-kod) orqali; tugatilganda tizimdagi
 * qoldiq bilan solishtirilib hisobot qotiriladi.
 */
@Entity('inventory_counts')
export class InventoryCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** INV26-000001 */
  @Column({ length: 40, unique: true })
  number: string;

  @Column({ type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Index()
  @Column({ type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  /** Rejadagi boshlanish va tugash sanasi */
  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  /** Mas'ul xodim */
  @Column({ type: 'uuid', nullable: true })
  responsibleId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsibleId' })
  responsible: User;

  @Index()
  @Column({ type: 'varchar', length: 20, default: InventoryStatus.PLANNED })
  status: InventoryStatus;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** Sanash haqiqatda qachon boshlandi / tugatildi */
  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  finishedById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'finishedById' })
  finishedBy: User;

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
