import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { LocalizedName } from '../common/localized-name';
import { Country } from './country.entity';

/** Viloyat (hudud) - har doim bitta davlatga tegishli */
@Entity('regions')
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column(() => LocalizedName)
  name: LocalizedName;

  @Column({ type: 'uuid' })
  countryId: string;

  // Davlat o'chirilsa viloyatlari egasiz qolmasin - xizmatda
  // viloyati bor davlat o'chirilmaydi deb tekshiriladi
  @ManyToOne(() => Country, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'countryId' })
  country: Country;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
