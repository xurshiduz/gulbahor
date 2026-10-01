import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class TransferItemDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Tovar notog`ri tanlangan' })
  materialId: string;

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Soni son bo`lishi kerak' })
  @Min(0.001, { message: 'Soni noldan katta bo`lishi kerak' })
  @Max(99999999)
  quantity: number;
}

export class CreateTransferDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Yuboruvchi omborxona tanlanishi shart' })
  fromWarehouseId: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Qabul qiluvchi omborxona tanlanishi shart' })
  toWarehouseId: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: [TransferItemDto] })
  @IsArray()
  @ArrayMaxSize(2000, { message: 'Bitta ko`chirishda eng ko`pi 2000 ta qator' })
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];

  @ApiProperty({ required: false, type: [String], description: 'RFID orqali qo`shilgan donalar (EPC)' })
  @IsOptional() @IsArray() @ArrayMaxSize(20000)
  @IsString({ each: true }) @MaxLength(40, { each: true })
  epcs?: string[];
}
export class UpdateTransferDto extends PartialType(CreateTransferDto) {}

export class ReceiveItemDto {
  @ApiProperty()
  @IsUUID('4')
  itemId: string;

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Qabul qilingan soni son bo`lishi kerak' })
  @Min(0) @Max(99999999)
  receivedQuantity: number;
}

export class ReceiveTransferDto {
  @ApiProperty({ type: [ReceiveItemDto] })
  @IsArray() @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];

  @ApiProperty({ required: false, type: [String], description: 'Qabul qiluvchi o`qigan RFID metkalar' })
  @IsOptional() @IsArray() @ArrayMaxSize(20000)
  @IsString({ each: true }) @MaxLength(40, { each: true })
  epcs?: string[];

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}

export class ResolveCodesDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMaxSize(1000)
  @IsString({ each: true }) @MaxLength(100, { each: true })
  codes: string[];
}
