import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProductCategory } from '../../references/entities/product-category.entity';
import { ProductBrand } from '../../references/entities/product-brand.entity';
import { ProductUnit } from '../../references/entities/product-unit.entity';
import { Color } from '../../references/entities/color.entity';
import { Size } from '../../references/entities/size.entity';
import { Country } from '../../references/entities/country.entity';
import { MaterialImage } from './material-image.entity';

const numeric = { to: (value: number) => value, from: (value: string) => (value === null ? null : Number(value)) };

/**
 * Material (tovar). Xususiyatlari ma'lumotnomalardan tanlanadi: kategoriya,
 * brend, o'lchov birligi, rang, o'lcham, ishlab chiqarilgan davlat.
 * Ma'lumotnoma yozuvi o'chirilsa material o'chmaydi - bog'lanish bo'shaydi
 * (kategoriya va birlikdan tashqari: ular majburiy, o'chirishga yo'l qo'yilmaydi).
 */
@Entity('materials')
export class Material {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  /** Artikul - ichki kod, takrorlanmaydi */
  @Column({ length: 60, nullable: true })
  sku: string;

  /** Shtrix-kod (EAN-13 va h.k.), takrorlanmaydi */
  @Column({ length: 60, nullable: true })
  barcode: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => ProductCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: ProductCategory;

  @Column({ type: 'uuid', nullable: true })
  brandId: string;

  @ManyToOne(() => ProductBrand, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'brandId' })
  brand: ProductBrand;

  @Column({ type: 'uuid' })
  unitId: string;

  @ManyToOne(() => ProductUnit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unitId' })
  unit: ProductUnit;

  @Column({ type: 'uuid', nullable: true })
  colorId: string;

  @ManyToOne(() => Color, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'colorId' })
  color: Color;

  @Column({ type: 'uuid', nullable: true })
  sizeId: string;

  @ManyToOne(() => Size, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sizeId' })
  size: Size;

  /** Ishlab chiqarilgan davlat */
  @Column({ type: 'uuid', nullable: true })
  countryId: string;

  @ManyToOne(() => Country, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'countryId' })
  country: Country;

  @Column({ type: 'text', nullable: true })
  description: string;

  /* ------------------------------ Soliq ma'lumotlari ----------------------------- */

  /** MXIK (IKPU) - mahsulot va xizmatlarning yagona identifikatsiya kodi, 17 ta raqam */
  @Column({ length: 17, nullable: true })
  mxikCode: string;

  /** MXIK bo'yicha o'ram (qadoq) kodi - elektron hisob-faktura va chekda kerak */
  @Column({ length: 20, nullable: true })
  packageCode: string;

  /** TIF TN (TN VED) kodi - 10 ta raqam, import/eksportda */
  @Column({ length: 10, nullable: true })
  tnvedCode: string;

  /** QQS stavkasi, foizda. null - QQSsiz (QQS to'lovchisi emas yoki ozod) */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numeric })
  vatRate: number;

  /** Majburiy raqamli markirovka (DataMatrix) talab qilinadigan tovar */
  @Column({ default: false })
  isMarked: boolean;

  @OneToMany(() => MaterialImage, (image) => image.material)
  images: MaterialImage[];

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
