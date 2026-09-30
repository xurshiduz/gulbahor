import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Contractor } from '../../contractors/entities/contractor.entity';
import { Warehouse } from '../../administration/entities/warehouse.entity';
import { User } from '../../users/entities/user.entity';
import { OutboundDocumentItem } from './outbound-document-item.entity';

export enum OutboundDocumentStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
}

/**
 * Chiqim (sotuv) hujjati - barcha sotuvlar shu yerda.
 *
 * Mijoz, izoh va tovarlar ro'yxati (soni, sotuv narxi). Tasdiqlangan
 * hujjatdan kirimdagi "Qaytarish" va "Almashinuv" tovar oladi (chek raqami
 * yoki mijozning sotuvlari bo'yicha).
 */
@Entity('outbound_documents')
export class OutboundDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Hujjat (chek) raqami - qaytarishda shu bo'yicha qidiriladi */
  @Column({ length: 40, unique: true })
  documentNumber: string;

  @Column({ type: 'date' })
  documentDate: string;

  @Column({ type: 'varchar', length: 20, default: OutboundDocumentStatus.DRAFT })
  status: OutboundDocumentStatus;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  customerId: string;

  @ManyToOne(() => Contractor, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId' })
  customer: Contractor;

  /** Tovar qaysi ombordan chiqadi */
  @Column({ type: 'uuid', nullable: true })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => OutboundDocumentItem, (item) => item.document)
  items: OutboundDocumentItem[];

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  approvedById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approvedById' })
  approvedBy: User;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
