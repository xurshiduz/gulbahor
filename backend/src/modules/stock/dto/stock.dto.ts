import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

export class StockQueryDto {
  @ApiProperty({ required: false, description: 'Filial - uning barcha omborlari' })
  @IsOptional() @ValidateIf(filled('branchId'))
  @IsUUID('4', { message: 'Filial notog`ri tanlangan' })
  branchId?: string;

  @ApiProperty({ required: false, description: 'Bitta omborxona' })
  @IsOptional() @ValidateIf(filled('warehouseId'))
  @IsUUID('4', { message: 'Omborxona notog`ri tanlangan' })
  warehouseId?: string;
}
