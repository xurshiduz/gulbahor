import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

/** Marketpleys sozlamalari */
export class MarketplaceOptionsDto {
  @ApiProperty({ required: false, type: [String], description: 'Qoldig`i yuboriladigan omborlarimiz' })
  @IsOptional() @IsArray() @ArrayMaxSize(100)
  @IsUUID('4', { each: true, message: 'Omborxona notog`ri tanlangan' })
  warehouseIds?: string[];

  @ApiProperty({ required: false, description: 'Marketpleysdagi ombor (Uzum - do`kon) ID si' })
  @IsOptional() @IsString() @MaxLength(60)
  targetWarehouseId?: string;

  @ApiProperty({ required: false, enum: ['barcode', 'sku'], description: 'Ozon: offer_id sifatida nima yuboriladi' })
  @IsOptional() @IsIn(['barcode', 'sku'])
  matchBy?: 'barcode' | 'sku';

  @ApiProperty({ required: false, description: 'Zaxira: har tovardan shuncha dona do`konda qoladi, marketpleysga yuborilmaydi' })
  @IsOptional() @IsInt() @Min(0) @Max(100000)
  safetyStock?: number;

  @ApiProperty({ required: false, description: 'Avtomatik yuborish oralig`i, daqiqa (0 - o`chiq)' })
  @IsOptional() @IsInt() @Min(0) @Max(1440)
  autoSyncMinutes?: number;
}

export class UpdateIntegrationDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isEnabled?: boolean;

  @ApiProperty({ required: false, description: 'Test (sandbox) rejimi' })
  @IsOptional() @IsBoolean()
  isTest?: boolean;

  @ApiProperty({ required: false, description: 'Kalitlar. Maxfiy maydon bo`sh yuborilsa - eskisi qoladi' })
  @IsOptional() @IsObject()
  credentials?: Record<string, string>;

  @ApiProperty({ required: false, nullable: true, description: 'To`lovlar: qaysi to`lov turiga yoziladi' })
  @IsOptional() @ValidateIf(filled('paymentTypeId'))
  @IsUUID('4', { message: 'To`lov turi notog`ri tanlangan' })
  paymentTypeId?: string | null;

  @ApiProperty({ required: false, type: MarketplaceOptionsDto })
  @IsOptional() @ValidateNested() @Type(() => MarketplaceOptionsDto)
  marketplace?: MarketplaceOptionsDto;
}

/** Kassada integratsiyalashgan to'lovni boshlash */
export class StartPaymentDto {
  @ApiProperty({ example: 'CLICK' })
  @IsString() @MaxLength(30)
  provider: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Kassa tanlanishi shart' })
  cashRegisterId: string;

  @ApiProperty({ example: 150000, description: 'So`mda. UDS da - yechiladigan ball' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Summa son bo`lishi kerak' })
  @Min(1, { message: 'Summa noldan katta bo`lishi kerak' })
  @Max(9999999999999)
  amount: number;

  @ApiProperty({ required: false, description: 'Click Pass QR kodi yoki UDS kodi' })
  @IsOptional() @IsString() @MaxLength(200)
  code?: string;

  @ApiProperty({ required: false, description: 'Payme: chek yuboriladigan telefon' })
  @IsOptional() @ValidateIf(filled('phone'))
  @Matches(/^\+?[\d\s()-]{9,20}$/, { message: 'Telefon raqam notog`ri' })
  phone?: string;

  @ApiProperty({ required: false, description: 'Terminal: RRN / tranzaksiya raqami' })
  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;

  @ApiProperty({ required: false, description: 'UDS: chekning to`liq summasi (keshbek shundan hisoblanadi)' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  receiptTotal?: number;

  @ApiProperty({ required: false, type: 'array', description: 'Payme fiskal chek uchun tovarlar' })
  @IsOptional() @IsArray() @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => PaymentItemDto)
  items?: PaymentItemDto[];
}

export class PaymentItemDto {
  @IsUUID('4') materialId: string;
  @IsNumber() @Min(0.001) quantity: number;
  @IsNumber() @Min(0) price: number;
}
