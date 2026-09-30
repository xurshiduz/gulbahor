import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Country } from './country.entity';

/**
 * Brend. Nomi tarjima qilinmaydi - brend nomi hamma tilda bir xil
 * yoziladi (Zara, LC Waikiki, Mango).
 */
@Entity('product_brands')
export class ProductBrand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  /** Brend qaysi davlatniki - ixtiyoriy */
  @Column({ type: 'uuid', nullable: true })
  countryId: string;

  @ManyToOne(() => Country, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'countryId' })
  country: Country;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
