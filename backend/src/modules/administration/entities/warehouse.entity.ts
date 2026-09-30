import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Branch } from './branch.entity';

/** Omborxona - har doim bitta filialga tegishli */
@Entity('warehouses')
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 160 })
  name: string;

  @Column({ type: 'uuid' })
  branchId: string;

  // Filial o'chirilsa omborlari egasiz qolmasin - xizmatda tekshiriladi
  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  /** Ombor mudiri / mas'ul shaxs */
  @Column({ length: 160, nullable: true })
  responsibleName: string;

  @Column({ length: 255, nullable: true })
  address: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
