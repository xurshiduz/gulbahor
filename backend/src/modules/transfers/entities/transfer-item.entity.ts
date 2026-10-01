import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { numeric } from '../../references/common/numeric';
import { Transfer } from './transfer.entity';

/** Ko'chirish qatori: yuborilgan va qabul qilingan soni */
@Entity('transfer_items')
export class TransferItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  transferId: string;

  @ManyToOne(() => Transfer, (transfer) => transfer.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transferId' })
  transfer: Transfer;

  @Index()
  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  quantity: number;

  /** Qabul qilinganda to'ldiriladi; yuborilganidan kam bo'lishi mumkin (kamomad) */
  @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true, transformer: numeric })
  receivedQuantity: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
