import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { DiscountKind, PromotionScope } from '../entities/promotion.entity';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* --------------------------------- Aksiyalar -------------------------------- */

class PromotionDto {
  @ApiProperty({ example: 'Yozgi chegirma' })
  @IsString()
  @IsNotEmpty({ message: 'Aksiya nomi kiritilishi shart' })
  @MaxLength(160)
  name: string;

  @ApiProperty({ required: false, nullable: true, example: '2026-10-01' })
  @IsOptional() @ValidateIf(filled('startDate'))
  @Matches(DATE, { message: 'Boshlanish sanasi notog`ri' })
  startDate?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '2026-10-31' })
  @IsOptional() @ValidateIf(filled('endDate'))
  @Matches(DATE, { message: 'Tugash sanasi notog`ri' })
  endDate?: string | null;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

/** Tovarlarga bog'langan aksiyalar: hammasiga, kategoriyalarga yoki tanlangan materiallarga */
class ScopedPromotionDto extends PromotionDto {
  @ApiProperty({ enum: PromotionScope, default: PromotionScope.ALL })
  @IsIn(Object.values(PromotionScope), { message: 'Aksiya qaysi tovarlarga tegishli ekani tanlanishi shart' })
  appliesTo: PromotionScope;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsUUID('4', { each: true })
  materialIds?: string[];
}

export class CreateDiscountPromotionDto extends ScopedPromotionDto {
  @ApiProperty({ enum: DiscountKind })
  @IsIn(Object.values(DiscountKind), { message: 'Chegirma turi tanlanishi shart' })
  discountKind: DiscountKind;

  @ApiProperty({ description: 'Foiz, summa yoki maxsus narx' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Qiymat son bo`lishi kerak' })
  @Min(0.01, { message: 'Qiymat noldan katta bo`lishi kerak' })
  value: number;
}
export class UpdateDiscountPromotionDto extends PartialType(CreateDiscountPromotionDto) {}

export class CreateGiftPromotionDto extends ScopedPromotionDto {
  @ApiProperty({ example: 2, description: 'Nechta sotib olinsa' })
  @IsInt({ message: 'Sotib olinadigan soni butun son bo`lishi kerak' }) @Min(1) @Max(100)
  buyQuantity: number;

  @ApiProperty({ example: 1, description: 'Nechtasi sovg`a' })
  @IsInt({ message: 'Sovg`a soni butun son bo`lishi kerak' }) @Min(1) @Max(100)
  giftQuantity: number;
}
export class UpdateGiftPromotionDto extends PartialType(CreateGiftPromotionDto) {}

export class CarouselTierDto {
  @ApiProperty({ example: 2 })
  @IsInt({ message: 'Bosqichdagi soni butun son bo`lishi kerak' }) @Min(1) @Max(1000)
  quantity: number;

  @ApiProperty({ example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Chegirma foizi son bo`lishi kerak' })
  @Min(0.01, { message: 'Chegirma foizi noldan katta bo`lishi kerak' })
  @Max(100, { message: 'Chegirma 100% dan oshmaydi' })
  percent: number;
}

export class CreateCarouselPromotionDto extends ScopedPromotionDto {
  @ApiProperty({ type: [CarouselTierDto], description: '1 = 20%, 2 = 30%, 3 = 40%' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta bosqich kiritilishi shart' })
  @ArrayMaxSize(10, { message: 'Eng ko`pi 10 ta bosqich' })
  @ValidateNested({ each: true })
  @Type(() => CarouselTierDto)
  tiers: CarouselTierDto[];
}
export class UpdateCarouselPromotionDto extends PartialType(CreateCarouselPromotionDto) {}

export class CreateReceiptPromotionDto extends PromotionDto {
  @ApiProperty({ description: 'Chekning eng kam summasi' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Chek summasi son bo`lishi kerak' })
  @Min(0.01, { message: 'Chek summasi noldan katta bo`lishi kerak' })
  minAmount: number;

  @ApiProperty({ enum: [DiscountKind.PERCENT, DiscountKind.AMOUNT] })
  @IsIn([DiscountKind.PERCENT, DiscountKind.AMOUNT], { message: 'Chegirma turi tanlanishi shart (foiz yoki summa)' })
  discountKind: DiscountKind;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Chegirma son bo`lishi kerak' })
  @Min(0.01, { message: 'Chegirma noldan katta bo`lishi kerak' })
  value: number;
}
export class UpdateReceiptPromotionDto extends PartialType(CreateReceiptPromotionDto) {}

/* ---------------------------- Sovg'a sertifikatlari --------------------------- */

export class CreateGiftCertificateDto {
  @ApiProperty({ required: false, description: 'Bo`sh bo`lsa avtomatik yasaladi' })
  @IsOptional() @ValidateIf(filled('code'))
  @Matches(/^[A-Za-z0-9-]{4,32}$/, { message: 'Kod 4-32 ta harf, raqam yoki "-" dan iborat bo`lishi kerak' })
  code?: string;

  @ApiProperty({ example: 500000, description: 'Nominal, so`m' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Nominal son bo`lishi kerak' })
  @Min(1, { message: 'Nominal noldan katta bo`lishi kerak' })
  amount: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('validUntil'))
  @Matches(DATE, { message: 'Amal qilish muddati notog`ri' })
  validUntil?: string | null;

  @ApiProperty({ required: false, default: 1, description: 'Bir yo`la nechta yaratilsin (kodlari avtomatik)' })
  @IsOptional()
  @IsInt({ message: 'Soni butun son bo`lishi kerak' }) @Min(1) @Max(500, { message: 'Bir yo`la eng ko`pi 500 ta' })
  count?: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
export class UpdateGiftCertificateDto extends PartialType(CreateGiftCertificateDto) {}

export class SellGiftCertificateDto {
  @ApiProperty({ required: false, nullable: true, description: 'Sotib olgan mijoz' })
  @IsOptional() @ValidateIf(filled('customerId'))
  @IsUUID('4', { message: 'Mijoz notog`ri tanlangan' })
  customerId?: string | null;
}
