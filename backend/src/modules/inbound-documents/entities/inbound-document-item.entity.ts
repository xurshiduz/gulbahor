import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { OutboundDocument } from '../../outbound-documents/entities/outbound-document.entity';
import { OutboundDocumentItem } from '../../outbound-documents/entities/outbound-document-item.entity';
import { numeric } from '../../references/common/numeric';
import { InboundDocument } from './inbound-document.entity';

/** Kirim hujjati qatori */
@Entity('inbound_document_items')
export class InboundDocumentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  documentId: string;

  @ManyToOne(() => InboundDocument, (document) => document.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: InboundDocument;

  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  quantity: number;

  /** Xaridda - kirim narxi; qaytarish va almashinuvda - sotuvdagi narx */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: numeric })
  price: number;

  /** Qaytarish / almashinuv: tovar qaysi sotuv hujjatidan qaytmoqda */
  @Column({ type: 'uuid', nullable: true })
  sourceOutboundDocumentId: string;

  @ManyToOne(() => OutboundDocument, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sourceOutboundDocumentId' })
  sourceOutboundDocument: OutboundDocument;

  /** ...va o'sha hujjatning aynan qaysi qatoridan (qaytarish mumkin bo'lgan son shundan hisoblanadi) */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  sourceOutboundItemId: string;

  @ManyToOne(() => OutboundDocumentItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sourceOutboundItemId' })
  sourceOutboundItem: OutboundDocumentItem;

  /** Hujjatdagi tartib - qo'shilgan ketma-ketlikda */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
