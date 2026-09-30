import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

export class PosItemDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Tovar notog`ri tanlangan' })
  materialId: string;

  @ApiProperty({ example: 1 })
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Soni son bo`lishi kerak' })
  @Min(0.001, { message: 'Soni noldan katta bo`lishi kerak' })
  @Max(99999999)
  quantity: number;

  @ApiProperty({ example: 350000, description: 'Chegirmasiz sotuv narxi' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Narx son bo`lishi kerak' })
  @Min(0, { message: 'Narx manfiy bo`lmaydi' })
  price: number;

  @ApiProperty({ required: false, example: 10, description: 'Qator chegirmasi, %' })
  @IsOptional() @ValidateIf(filled('discountPercent'))
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Chegirma son bo`lishi kerak' })
  @Min(0) @Max(100, { message: 'Chegirma 100% dan oshmaydi' })
  discountPercent?: number;
}

export class PosPaymentDto {
  @ApiProperty({ required: false, nullable: true, description: 'Naqd, karta...' })
  @IsOptional() @ValidateIf(filled('paymentTypeId'))
  @IsUUID('4', { message: 'To`lov turi notog`ri tanlangan' })
  paymentTypeId?: string | null;

  @ApiProperty()
  @IsUUID('4', { message: 'Valyuta tanlanishi shart' })
  currencyId: string;

  @ApiProperty({ example: 350000 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Summa son bo`lishi kerak' })
  @Min(0.01, { message: 'Summa noldan katta bo`lishi kerak' })
  @Max(9999999999999)
  amount: number;

  @ApiProperty({ required: false, example: 12650, description: 'So`mdan boshqa valyutada shart' })
  @IsOptional() @ValidateIf(filled('rate'))
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Kurs son bo`lishi kerak' })
  @Min(0.0001) @Max(99999999999)
  rate?: number;

  @ApiProperty({ required: false, description: 'Berilmasa summa x kurs' })
  @IsOptional() @ValidateIf(filled('amountUzs'))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01) @Max(9999999999999999)
  amountUzs?: number;
}

export class PosSaleDto {
  @ApiProperty({ required: false, nullable: true, description: 'Bo`sh bo`lsa - chakana xaridor' })
  @IsOptional() @ValidateIf(filled('customerId'))
  @IsUUID('4', { message: 'Mijoz notog`ri tanlangan' })
  customerId?: string | null;

  @ApiProperty({ description: 'Kassa: pul shu kassaga tushadi, tovar kassaning omboridan chiqadi' })
  @IsUUID('4', { message: 'Kassa tanlanishi shart' })
  cashRegisterId: string;

  @ApiProperty({ type: [PosItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Chek bo`sh - avval tovar qo`shing' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PosItemDto)
  items: PosItemDto[];

  @ApiProperty({ required: false, example: 20000, description: 'Butun chek bo`yicha chegirma (so`m)' })
  @IsOptional() @ValidateIf(filled('discountAmount'))
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Chegirma son bo`lishi kerak' })
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ type: [PosPaymentDto], required: false, description: 'To`lov bir necha usulda bo`lishi mumkin' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PosPaymentDto)
  payments?: PosPaymentDto[];

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}

/** Kassada yangi mijoz qo'shish: F.I.O, telefon va tug'ilgan kun */
export class PosCustomerDto {
  @ApiProperty({ example: 'Karimova Dilnoza' })
  @IsString()
  @IsNotEmpty({ message: 'F.I.O kiritilishi shart' })
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @IsNotEmpty({ message: 'Telefon raqam kiritilishi shart' })
  @MaxLength(30)
  @Matches(/^\+?[\d\s()-]{7,30}$/, { message: 'Telefon raqam notog`ri' })
  phone: string;

  @ApiProperty({ example: '1990-05-17', description: 'Tug`ilgan kun' })
  @IsNotEmpty({ message: 'Tug`ilgan kun kiritilishi shart' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tug`ilgan kun notog`ri' })
  birthDate: string;
}
