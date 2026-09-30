import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { InboundDocumentType } from '../entities/inbound-document.entity';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

export class InboundItemDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Tovar notog`ri tanlangan' })
  materialId: string;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Soni son bo`lishi kerak' })
  @Min(0.001, { message: 'Soni noldan katta bo`lishi kerak' })
  @Max(99999999)
  quantity: number;

  @ApiProperty({ required: false, example: 85000, description: 'Xaridda kirim narxi; qaytarishda sotuv narxi serverda qo`yiladi' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Narx son bo`lishi kerak' })
  @Min(0, { message: 'Narx manfiy bo`lmaydi' })
  price?: number;

  @ApiProperty({ required: false, nullable: true, description: 'Qaytarish / almashinuv: sotuv hujjatining qatori' })
  @IsOptional() @ValidateIf(filled('sourceOutboundItemId'))
  @IsUUID('4', { message: 'Sotuv qatori notog`ri' })
  sourceOutboundItemId?: string | null;
}

export class CreateInboundDocumentDto {
  @ApiProperty({ enum: InboundDocumentType })
  @IsIn(Object.values(InboundDocumentType), { message: 'Hujjat turi tanlanishi shart' })
  type: InboundDocumentType;

  @ApiProperty({ required: false, example: '2026-09-30', description: 'Bo`sh bo`lsa - bugun' })
  @IsOptional() @ValidateIf(filled('documentDate'))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana notog`ri' })
  documentDate?: string;

  @ApiProperty({ description: 'Xaridda yetkazib beruvchi, qaytarish va almashinuvda mijoz' })
  @IsUUID('4', { message: 'Kontragent tanlanishi shart' })
  contractorId: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Omborxona tanlanishi shart' })
  warehouseId: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('currencyId'))
  @IsUUID('4', { message: 'Valyuta notog`ri tanlangan' })
  currencyId?: string | null;

  @ApiProperty({ required: false, description: 'Jo`natma raqami (xarid)' })
  @IsOptional() @IsString() @MaxLength(100)
  shipmentNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: [InboundItemDto] })
  @IsArray()
  @ArrayMaxSize(2000, { message: 'Bitta hujjatda eng ko`pi 2000 ta qator' })
  @ValidateNested({ each: true })
  @Type(() => InboundItemDto)
  items: InboundItemDto[];
}

/** Turi hujjat yaratilgandan keyin o'zgarmaydi */
export class UpdateInboundDocumentDto extends PartialType(OmitType(CreateInboundDocumentDto, ['type'] as const)) {}

export class LabelItemDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Tovar notog`ri tanlangan' })
  materialId: string;

  @ApiProperty({ example: 10, description: 'Nechta dona uchun etiketka (1-donadan boshlab)' })
  @IsInt({ message: 'Etiketka soni butun son bo`lishi kerak' })
  @Min(0)
  @Max(1000)
  count: number;
}

export class PrintLabelsDto {
  @ApiProperty({ type: [LabelItemDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LabelItemDto)
  items: LabelItemDto[];

  @ApiProperty({ required: false, example: '50x30' })
  @IsOptional() @IsString() @MaxLength(10)
  size?: string;

  @ApiProperty({ required: false, description: 'Faqat hali chop etilmagan donalar' })
  @IsOptional() @IsBoolean()
  onlyNew?: boolean;

  @ApiProperty({ required: false, description: 'false - RFID chipsiz oddiy etiketka' })
  @IsOptional() @IsBoolean()
  rfid?: boolean;
}
