import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { numeric } from '../../references/common/numeric';
import { InventoryCount } from './inventory-count.entity';

/**
 * Inventarizatsiya natijasi - tugatilganda qotiriladi: tizimda qancha
 * bo'lishi kerak edi, qancha sanaldi, farqi va uning qiymati. Keyin
 * hujjatlar o'zgarsa ham hisobot o'zgarmaydi.
 */
@Entity('inventory_count_items')
export class InventoryCountItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  countId: string;

  @ManyToOne(() => InventoryCount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'countId' })
  count: InventoryCount;

  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  /** Tizim bo'yicha (tasdiqlangan hujjatlardan) */
  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  expected: number;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  counted: number;

  /** counted - expected: manfiy - kamomad, musbat - ortiqcha */
  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  difference: number;

  /** O'rtacha kirim narxi (tannarx) */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: numeric })
  costPrice: number;

  /** Sotuv narxi */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: numeric })
  salePrice: number;
}
