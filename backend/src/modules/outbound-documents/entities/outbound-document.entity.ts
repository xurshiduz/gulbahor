import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Contractor } from '../../contractors/entities/contractor.entity';
import { Warehouse } from '../../administration/entities/warehouse.entity';
import { OutboundDocumentItem } from './outbound-document-item.entity';

export enum OutboundDocumentStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
}

/**
 * Chiqim (sotuv) hujjati.
 *
 * Hozircha faqat ma'lumot tuzilmasi va qidiruv bor: kirimdagi "Qaytarish"
 * va "Almashinuv" tovarni aynan shu hujjatlardan oladi (chek raqami yoki
 * mijozning sotuvlari bo'yicha). Hujjatni yaratish formasi Chiqim moduli
 * bilan qo'shiladi.
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

  /** Mijoz - chakana sotuvda bo'lmasligi mumkin */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  customerId: string;

  @ManyToOne(() => Contractor, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId' })
  customer: Contractor;

  @Column({ type: 'uuid', nullable: true })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => OutboundDocumentItem, (item) => item.document)
  items: OutboundDocumentItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
