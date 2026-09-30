import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

/* ---------------------------------- Kassalar --------------------------------- */

export class CreateCashRegisterDto {
  @ApiProperty({ example: '1-kassa' })
  @IsString()
  @IsNotEmpty({ message: 'Kassa nomi kiritilishi shart' })
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Filial tanlanishi shart' })
  branchId: string;

  @ApiProperty({ required: false, nullable: true, description: 'Kassada sotilgan tovar shu ombordan chiqadi' })
  @IsOptional() @ValidateIf(filled('warehouseId'))
  @IsUUID('4', { message: 'Omborxona notog`ri tanlangan' })
  warehouseId?: string | null;

  @ApiProperty({ required: false, type: [String], description: 'Kassirlar. Bo`sh - kassa hammaga ochiq' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true, message: 'Kassir notog`ri tanlangan' })
  userIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
export class UpdateCashRegisterDto extends PartialType(CreateCashRegisterDto) {}

/* ---------------------------------- Qoldiq ----------------------------------- */

export class CashBalanceQueryDto {
  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('branchId'))
  @IsUUID('4', { message: 'Filial notog`ri tanlangan' })
  branchId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('cashRegisterId'))
  @IsUUID('4', { message: 'Kassa notog`ri tanlangan' })
  cashRegisterId?: string;

  @ApiProperty({ required: false, example: '2026-09-01', description: 'Shu sanadan (kiradi)' })
  @IsOptional() @ValidateIf(filled('from'))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana YYYY-MM-DD ko`rinishida bo`lishi kerak' })
  from?: string;

  @ApiProperty({ required: false, example: '2026-09-30', description: 'Shu sanagacha (kiradi)' })
  @IsOptional() @ValidateIf(filled('to'))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana YYYY-MM-DD ko`rinishida bo`lishi kerak' })
  to?: string;
}

/* ---------------------------- Kassadan olingan pul ---------------------------- */

export class CreateCashWithdrawalDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Kassa tanlanishi shart' })
  cashRegisterId: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Valyuta tanlanishi shart' })
  currencyId: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('paymentTypeId'))
  @IsUUID('4', { message: 'To`lov turi notog`ri tanlangan' })
  paymentTypeId?: string | null;

  @ApiProperty({ example: 5000000 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Summa son bo`lishi kerak (kasr qismi 2 xonagacha)' })
  @Min(0.01, { message: 'Summa noldan katta bo`lishi kerak' })
  @Max(9999999999999)
  amount: number;

  @ApiProperty({ required: false, nullable: true, description: 'Kimdan olindi (kassir)' })
  @IsOptional() @ValidateIf(filled('fromUserId'))
  @IsUUID('4', { message: 'Kassir notog`ri tanlangan' })
  fromUserId?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Kim olib ketdi. Bo`sh - kirituvchining o`zi' })
  @IsOptional() @ValidateIf(filled('takenById'))
  @IsUUID('4', { message: 'Olib ketgan xodim notog`ri tanlangan' })
  takenById?: string | null;

  @ApiProperty({ required: false, description: 'Bo`sh bo`lsa - hozir' })
  @IsOptional() @ValidateIf(filled('withdrawnAt'))
  @Matches(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/, { message: 'Vaqt notog`ri' })
  withdrawnAt?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}
