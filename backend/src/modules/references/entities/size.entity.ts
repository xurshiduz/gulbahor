import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * O'lcham. Nomi tarjima qilinmaydi: "M", "42", "XL" hamma tilda bir xil.
 *
 * `scale` - o'lcham shkalasi ("Alfa", "Raqamli", "Poyabzal"). Bitta nom
 * turli shkalada uchrashi mumkin, shuning uchun takrorlanmaslik shkala
 * ichida tekshiriladi.
 */
@Entity('sizes')
export class Size {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40 })
  name: string;

  @Column({ length: 60, nullable: true })
  scale: string;

  /** Ro'yxatdagi tartib: XS < S < M < L (alifbo bo'yicha to'g'ri chiqmaydi) */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
