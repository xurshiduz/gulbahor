import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** Bo'sh satr yoki null bo'lsa tekshiruv o'tkazib yuboriladi (ixtiyoriy maydonlar) */
const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

export class CreateMaterialDto {
  @ApiProperty({ example: 'Erkaklar klassik ko`ylagi' })
  @IsString()
  @IsNotEmpty({ message: 'Material nomi kiritilishi shart' })
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false, description: 'Artikul' })
  @IsOptional() @IsString() @MaxLength(60)
  sku?: string;

  @ApiProperty({ required: false, description: 'Shtrix-kod' })
  @IsOptional() @ValidateIf(filled('barcode'))
  @Matches(/^[A-Za-z0-9-]{4,60}$/, { message: 'Shtrix-kod 4-60 ta harf va raqamdan iborat bo`lishi kerak' })
  barcode?: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Kategoriya tanlanishi shart' })
  categoryId: string;

  @ApiProperty()
  @IsUUID('4', { message: 'O`lchov birligi tanlanishi shart' })
  unitId: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('brandId')) @IsUUID('4', { message: 'Brend notog`ri tanlangan' })
  brandId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('colorId')) @IsUUID('4', { message: 'Rang notog`ri tanlangan' })
  colorId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('sizeId')) @IsUUID('4', { message: 'O`lcham notog`ri tanlangan' })
  sizeId?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Ishlab chiqarilgan davlat' })
  @IsOptional() @ValidateIf(filled('countryId')) @IsUUID('4', { message: 'Davlat notog`ri tanlangan' })
  countryId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, description: 'MXIK (IKPU) - 17 ta raqam' })
  @IsOptional() @ValidateIf(filled('mxikCode'))
  @Matches(/^\d{17}$/, { message: 'MXIK kodi 17 ta raqamdan iborat bo`lishi kerak' })
  mxikCode?: string;

  @ApiProperty({ required: false, description: 'MXIK o`ram kodi' })
  @IsOptional() @ValidateIf(filled('packageCode'))
  @Matches(/^\d{1,20}$/, { message: 'O`ram kodi faqat raqamlardan iborat bo`lishi kerak' })
  packageCode?: string;

  @ApiProperty({ required: false, description: 'TIF TN (TN VED) - 10 ta raqam' })
  @IsOptional() @ValidateIf(filled('tnvedCode'))
  @Matches(/^\d{10}$/, { message: 'TN VED kodi 10 ta raqamdan iborat bo`lishi kerak' })
  tnvedCode?: string;

  @ApiProperty({ required: false, nullable: true, description: 'QQS stavkasi, %. null - QQSsiz' })
  @IsOptional() @ValidateIf((o) => o.vatRate !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'QQS stavkasi son bo`lishi kerak' })
  @Min(0) @Max(100)
  vatRate?: number | null;

  @ApiProperty({ required: false, nullable: true, example: 350000, description: 'Sotuv narxi (so`m) - kassada shu narx' })
  @IsOptional() @ValidateIf((o) => o.salePrice !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Sotuv narxi son bo`lishi kerak' })
  @Min(0, { message: 'Sotuv narxi manfiy bo`lmaydi' })
  @Max(9999999999999)
  salePrice?: number | null;

  @ApiProperty({ required: false, default: false, description: 'Majburiy raqamli markirovka' })
  @IsOptional() @IsBoolean()
  isMarked?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateMaterialDto extends PartialType(CreateMaterialDto) {}
