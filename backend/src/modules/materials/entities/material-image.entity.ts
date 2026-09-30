import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Material } from './material.entity';

/** Material rasmi. Bir nechta bo'ladi, bittasi asosiy (ro'yxatda shu ko'rinadi) */
@Entity('material_images')
export class MaterialImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Material, (material) => material.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  /** Brauzer uchun manzil: /uploads/materials/<fayl> */
  @Column()
  url: string;

  @Column({ default: false })
  isMain: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
