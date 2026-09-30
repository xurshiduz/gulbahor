import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Contractor } from '../../contractors/entities/contractor.entity';
import { Warehouse } from '../../administration/entities/warehouse.entity';
import { Currency } from '../../accounting/entities/currency.entity';
import { User } from '../../users/entities/user.entity';
import { InboundDocumentItem } from './inbound-document-item.entity';

export enum InboundDocumentType {
  /** Xarid - yetkazib beruvchidan */
  PURCHASE = 'PURCHASE',
  /** Qaytarish - mijoz sotib olgan tovarni qaytaradi */
  RETURN = 'RETURN',
  /** Almashinuv - mijoz tovarni boshqasiga almashtirish uchun qaytaradi */
  EXCHANGE = 'EXCHANGE',
}

export enum InboundDocumentStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
}

/** Kirim hujjati: xarid, qaytarish yoki almashinuv */
@Entity('inbound_documents')
export class InboundDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40, unique: true })
  documentNumber: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  type: InboundDocumentType;

  @Column({ type: 'varchar', length: 20, default: InboundDocumentStatus.DRAFT })
  status: InboundDocumentStatus;

  @Column({ type: 'date' })
  documentDate: string;

  /** Xaridda - yetkazib beruvchi; qaytarish va almashinuvda - mijoz */
  @Index()
  @Column({ type: 'uuid' })
  contractorId: string;

  @ManyToOne(() => Contractor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contractorId' })
  contractor: Contractor;

  @Column({ type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  /** Narxlar valyutasi (xaridda yetkazib beruvchining valyutasi). Bo'sh - so'm */
  @Column({ type: 'uuid', nullable: true })
  currencyId: string;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency;

  /** Jo'natma (konteyner, yuk xati) raqami - faqat xaridda */
  @Column({ length: 100, nullable: true })
  shipmentNumber: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => InboundDocumentItem, (item) => item.document)
  items: InboundDocumentItem[];

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
