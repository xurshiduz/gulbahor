import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Branch } from '../../administration/entities/branch.entity';
import { Warehouse } from '../../administration/entities/warehouse.entity';
import { User } from '../../users/entities/user.entity';
import { TransferItem } from './transfer-item.entity';

export enum TransferStatus {
  /** Qoralama - yuboruvchi tovar qo'shmoqda */
  DRAFT = 'DRAFT',
  /** Yuborilgan (yo'lda) - yuboruvchi ombordan chiqqan, qabul kutilmoqda */
  SENT = 'SENT',
  /** Qabul qilingan - qabul qiluvchi omborga kirgan */
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ko'chirish: bir filial (ombor) dan boshqasiga.
 *
 * Yuborilganda tovar yuboruvchi omborning qoldig'idan chiqadi; qabul
 * qilinganda qabul qiluvchi omborga haqiqatda kelgan soni kiradi.
 */
@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** KO26-000001 */
  @Column({ length: 40, unique: true })
  number: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: TransferStatus.DRAFT })
  status: TransferStatus;

  @Column({ type: 'uuid' })
  fromBranchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fromBranchId' })
  fromBranch: Branch;

  @Index()
  @Column({ type: 'uuid' })
  fromWarehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fromWarehouseId' })
  fromWarehouse: Warehouse;

  @Column({ type: 'uuid' })
  toBranchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'toBranchId' })
  toBranch: Branch;

  @Index()
  @Column({ type: 'uuid' })
  toWarehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'toWarehouseId' })
  toWarehouse: Warehouse;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => TransferItem, (item) => item.transfer)
  items: TransferItem[];

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ type: 'uuid', nullable: true })
  sentById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sentById' })
  sentBy: User;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  receivedById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receivedById' })
  receivedBy: User;

  /** Qabul qiluvchining izohi (kamomad sababi va hokazo) */
  @Column({ type: 'text', nullable: true })
  receiveNote: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
