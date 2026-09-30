import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { LocalizedName } from '../common/localized-name';

/**
 * Tovar kategoriyasi - ichma-ich joylashadi (ost kategoriyalar):
 * "Erkaklar kiyimi" -> "Ko'ylaklar" -> "Klassik ko'ylaklar".
 */
@Entity('product_categories')
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column(() => LocalizedName)
  name: LocalizedName;

  /** Ota kategoriya; bo'sh bo'lsa - eng yuqori daraja */
  @Column({ type: 'uuid', nullable: true })
  parentId: string;

  // Ota o'chirilganda bolalari bilan qolib ketmasin - xizmatda
  // avval bolalari bor kategoriya o'chirilmaydi deb tekshiriladi
  @ManyToOne(() => ProductCategory, (category) => category.children, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parentId' })
  parent: ProductCategory;

  @OneToMany(() => ProductCategory, (category) => category.parent)
  children: ProductCategory[];

  /** Ro'yxatdagi tartib - kichik raqam yuqorida */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
