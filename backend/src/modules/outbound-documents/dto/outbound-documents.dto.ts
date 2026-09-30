import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

export class OutboundItemDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Tovar notog`ri tanlangan' })
  materialId: string;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Soni son bo`lishi kerak' })
  @Min(0.001, { message: 'Soni noldan katta bo`lishi kerak' })
  @Max(99999999)
  quantity: number;

  @ApiProperty({ required: false, example: 250000, description: 'Sotuv narxi' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Narx son bo`lishi kerak' })
  @Min(0, { message: 'Narx manfiy bo`lmaydi' })
  price?: number;
}

export class CreateOutboundDocumentDto {
  @ApiProperty({ required: false, example: '2026-09-30', description: 'Bo`sh bo`lsa - bugun' })
  @IsOptional() @ValidateIf(filled('documentDate'))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana notog`ri' })
  documentDate?: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Mijoz tanlanishi shart' })
  customerId: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Omborxona tanlanishi shart' })
  warehouseId: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: [OutboundItemDto] })
  @IsArray()
  @ArrayMaxSize(2000, { message: 'Bitta hujjatda eng ko`pi 2000 ta qator' })
  @ValidateNested({ each: true })
  @Type(() => OutboundItemDto)
  items: OutboundItemDto[];
}

export class UpdateOutboundDocumentDto extends PartialType(CreateOutboundDocumentDto) {}
