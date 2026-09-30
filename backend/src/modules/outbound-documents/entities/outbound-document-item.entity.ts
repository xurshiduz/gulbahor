import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { numeric } from '../../references/common/numeric';
import { OutboundDocument } from './outbound-document.entity';

/** Chiqim hujjati qatori: sotilgan tovar, soni va sotuv narxi */
@Entity('outbound_document_items')
export class OutboundDocumentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  documentId: string;

  @ManyToOne(() => OutboundDocument, (document) => document.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: OutboundDocument;

  @Index()
  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  quantity: number;

  /** Sotuv narxi - qaytarishda tovar shu narxda qaytadi */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: numeric })
  price: number;

  /** Hujjatdagi tartib - qo'shilgan ketma-ketlikda */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
