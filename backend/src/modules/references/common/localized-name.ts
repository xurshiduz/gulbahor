import { Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Uch tildagi nom.
 *
 * Bazada alohida ustunlar bo'lib tushadi: `nameUz`, `nameRu`, `nameEn`
 * (TypeORM embedded). JSON o'rniga ustun bo'lgani uchun saralash, qidirish
 * va indeks odatdagidek ishlaydi.
 *
 * O'zbekcha va ruscha nom majburiy, inglizchasi ixtiyoriy - ko'pchilik
 * ma'lumotnomani ikki tilda to'ldiradi.
 */
export class LocalizedName {
  @Column({ length: 120 })
  uz: string;

  @Column({ length: 120 })
  ru: string;

  @Column({ length: 120, nullable: true })
  en: string;
}

export class LocalizedNameDto {
  @ApiProperty({ example: "Ko'ylak" })
  @IsString()
  @IsNotEmpty({ message: "O'zbekcha nom kiritilishi shart" })
  @MaxLength(120)
  uz: string;

  @ApiProperty({ example: 'Платье' })
  @IsString()
  @IsNotEmpty({ message: 'Ruscha nom kiritilishi shart' })
  @MaxLength(120)
  ru: string;

  @ApiProperty({ required: false, example: 'Dress' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  en?: string;
}

/** Bo'sh joylarni olib tashlaydi; inglizchasi bo'sh bo'lsa - null */
export function trimLocalized(name: LocalizedNameDto): LocalizedName {
  const clean = (value?: string) => String(value || '').trim();
  return { uz: clean(name?.uz), ru: clean(name?.ru), en: clean(name?.en) || null };
}
