import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

export class CreateInventoryDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Filial tanlanishi shart' })
  branchId: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Omborxona tanlanishi shart' })
  warehouseId: string;

  @ApiProperty({ example: '2026-10-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Boshlash sanasi notog`ri' })
  startDate: string;

  @ApiProperty({ example: '2026-10-02' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tugash sanasi notog`ri' })
  endDate: string;

  @ApiProperty({ required: false, nullable: true, description: 'Mas`ul xodim' })
  @IsOptional() @ValidateIf(filled('responsibleId'))
  @IsUUID('4', { message: 'Mas`ul xodim notog`ri tanlangan' })
  responsibleId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}
export class UpdateInventoryDto extends PartialType(CreateInventoryDto) {}

/** Skanerdan kelgan kodlar: RFID EPC yoki shtrix-kod / artikul */
export class ScanDto {
  @ApiProperty({ type: [String], example: ['47554C000000000000000001', '4780000011001'] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Kod yuborilmagan' })
  @ArrayMaxSize(1000, { message: 'Bir so`rovda eng ko`pi 1000 ta kod' })
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  codes: string[];
}
