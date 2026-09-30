import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { LocalizedName } from '../common/localized-name';

/**
 * O'lchov birligi: to'liq nomi ("Dona") va hujjatlarda ko'rinadigan
 * qisqartmasi ("dona" / "шт" / "pcs").
 */
@Entity('product_units')
export class ProductUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column(() => LocalizedName)
  name: LocalizedName;

  @Column(() => LocalizedName, { prefix: 'short' })
  shortName: LocalizedName;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
