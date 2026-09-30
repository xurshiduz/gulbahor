import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { LocalizedName } from '../common/localized-name';

/** Davlat - ishlab chiqarilgan joy, brend va viloyatlar uchun */
@Entity('countries')
export class Country {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column(() => LocalizedName)
  name: LocalizedName;

  /** ISO kodi: UZ, TR, CN. Ixtiyoriy, lekin takrorlanmaydi */
  @Column({ length: 3, nullable: true })
  code: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
