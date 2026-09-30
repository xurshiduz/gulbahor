import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { LocalizedName } from '../common/localized-name';

/** Rang - kiyimning asosiy belgisi, etiketka va hisobotlarda ishlatiladi */
@Entity('colors')
export class Color {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column(() => LocalizedName)
  name: LocalizedName;

  /** Ekranda ko'rsatish uchun rang kodi: #RRGGBB */
  @Column({ length: 7, nullable: true })
  hex: string;

  /** Ishlab chiqaruvchining rang kodi (masalan "TC-402") */
  @Column({ length: 40, nullable: true })
  code: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
