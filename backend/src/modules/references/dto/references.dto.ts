import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { LocalizedNameDto } from '../common/localized-name';

/** Hamma ma'lumotnomada bor maydonlar */
class BaseReferenceDto {
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class LocalizedReferenceDto extends BaseReferenceDto {
  @ApiProperty({ type: LocalizedNameDto })
  @IsDefined({ message: 'Nom kiritilishi shart' })
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  name: LocalizedNameDto;
}

/* ------------------------------ Kategoriyalar ----------------------------- */

export class CreateCategoryDto extends LocalizedReferenceDto {
  @ApiProperty({ required: false, nullable: true, description: 'Ota kategoriya; bo`sh bo`lsa eng yuqori daraja' })
  @IsOptional()
  @ValidateIf((o) => o.parentId !== null && o.parentId !== '')
  @IsUUID('4', { message: 'Ota kategoriya notog`ri tanlangan' })
  parentId?: string | null;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

/* -------------------------------- Brendlar -------------------------------- */

export class CreateBrandDto extends BaseReferenceDto {
  @ApiProperty({ example: 'Zara' })
  @IsString()
  @IsNotEmpty({ message: 'Brend nomi kiritilishi shart' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.countryId !== null && o.countryId !== '')
  @IsUUID('4', { message: 'Davlat notog`ri tanlangan' })
  countryId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

/* ---------------------------- O'lchov birliklari --------------------------- */

export class CreateUnitDto extends LocalizedReferenceDto {
  @ApiProperty({ type: LocalizedNameDto, description: 'Qisqartma: dona / шт / pcs' })
  @IsDefined({ message: 'Nom kiritilishi shart' })
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  shortName: LocalizedNameDto;
}
export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

/* --------------------------------- Ranglar -------------------------------- */

export class CreateColorDto extends LocalizedReferenceDto {
  @ApiProperty({ required: false, nullable: true, example: '#1E88E5' })
  @IsOptional()
  @ValidateIf((o) => o.hex !== null && o.hex !== '')
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'Rang kodi #RRGGBB ko`rinishida bo`lishi kerak' })
  hex?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'TC-402' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string | null;
}
export class UpdateColorDto extends PartialType(CreateColorDto) {}

/* -------------------------------- O'lchamlar ------------------------------- */

export class CreateSizeDto extends BaseReferenceDto {
  @ApiProperty({ example: 'XL' })
  @IsString()
  @IsNotEmpty({ message: "O'lcham nomi kiritilishi shart" })
  @MaxLength(40)
  name: string;

  @ApiProperty({ required: false, nullable: true, example: 'Alfa', description: "O'lcham shkalasi" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  scale?: string | null;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
export class UpdateSizeDto extends PartialType(CreateSizeDto) {}

/* -------------------------------- Davlatlar ------------------------------- */

export class CreateCountryDto extends LocalizedReferenceDto {
  @ApiProperty({ required: false, nullable: true, example: 'UZ' })
  @IsOptional()
  @ValidateIf((o) => o.code !== null && o.code !== '')
  @Matches(/^[A-Za-z]{2,3}$/, { message: 'Davlat kodi 2-3 ta harfdan iborat bo`lishi kerak (UZ, TUR)' })
  code?: string | null;
}
export class UpdateCountryDto extends PartialType(CreateCountryDto) {}

/* -------------------------------- Viloyatlar ------------------------------ */

export class CreateRegionDto extends LocalizedReferenceDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Davlat tanlanishi shart' })
  countryId: string;
}
export class UpdateRegionDto extends PartialType(CreateRegionDto) {}
