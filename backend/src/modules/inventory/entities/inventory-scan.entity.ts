import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { User } from '../../users/entities/user.entity';
import { numeric } from '../../references/common/numeric';
import { InventoryCount } from './inventory-count.entity';

/**
 * Sanalgan dona.
 *
 * RFID: har bir metka (EPC) bir marta - skaner bir metkani sekundiga
 * o'nlab marta o'qiydi, takrorlari yozilmaydi. Shtrix-kod: har skanerlash
 * +1 dona (EPC bo'sh).
 */
@Entity('inventory_scans')
@Index(['countId', 'epc'], { unique: true, where: '"epc" IS NOT NULL' })
export class InventoryScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  countId: string;

  @ManyToOne(() => InventoryCount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'countId' })
  count: InventoryCount;

  /** RFID metka kodi (24 hex) */
  @Column({ length: 24, nullable: true })
  epc: string;

  /** Shtrix-kod yoki artikul bilan sanalganda */
  @Column({ length: 100, nullable: true })
  code: string;

  /** Noma'lum metka (bizda chop etilmagan) - bo'sh */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  materialId: string;

  @ManyToOne(() => Material, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'numeric', precision: 14, scale: 3, default: 1, transformer: numeric })
  quantity: number;

  @Column({ type: 'uuid', nullable: true })
  scannedById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scannedById' })
  scannedBy: User;

  @CreateDateColumn()
  createdAt: Date;
}
