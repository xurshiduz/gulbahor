import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { Transfer } from './transfer.entity';

/**
 * RFID orqali qo'shilgan dona: qaysi metka yuborildi va qabul qiluvchi
 * uni o'qidimi. O'qilmagan metka - yo'lda yo'qolgan dona.
 */
@Entity('transfer_tags')
@Unique(['transferId', 'epc'])
export class TransferTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  transferId: string;

  @ManyToOne(() => Transfer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transferId' })
  transfer: Transfer;

  @Index()
  @Column({ length: 24 })
  epc: string;

  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  /** Qabul qiluvchi o'qigan vaqt; bo'sh - qabul qilinmagan */
  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date;
}
