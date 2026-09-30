import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ExpenseTarget } from '../entities/expense-type.entity';
import { PaymentDirection } from '../entities/payment.entity';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

class BaseDto {
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/* ------------------------------ Valyuta turlari ---------------------------- */

export class CreateCurrencyDto extends BaseDto {
  @ApiProperty({ example: 'AQSH dollari' })
  @IsString()
  @IsNotEmpty({ message: 'Valyuta nomi kiritilishi shart' })
  @MaxLength(80)
  name: string;

  @ApiProperty({ required: false, example: '$' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  symbol?: string;

  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Za-z]{3}$/, { message: 'Valyuta kodi 3 ta harfdan iborat bo`lishi kerak (USD, EUR)' })
  code: string;
}
export class UpdateCurrencyDto extends PartialType(CreateCurrencyDto) {}

/* ------------------------------- Valyuta kursi ----------------------------- */

export class CreateCurrencyRateDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Valyuta tanlanishi shart' })
  currencyId: string;

  @ApiProperty({ example: '2026-09-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana YYYY-MM-DD ko`rinishida bo`lishi kerak' })
  date: string;

  @ApiProperty({ example: 12650.5, description: '1 valyuta necha so`m' })
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Kurs son bo`lishi kerak (kasr qismi 4 xonagacha)' })
  @Min(0.0001, { message: 'Kurs noldan katta bo`lishi kerak' })
  @Max(99999999999, { message: 'Kurs juda katta' })
  rate: number;
}
export class UpdateCurrencyRateDto extends PartialType(CreateCurrencyRateDto) {}

/* ---------------------- To'lov turlari / Harajat turlari -------------------- */

class NamedDto extends BaseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Nom kiritilishi shart' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreatePaymentTypeDto extends NamedDto {}
export class UpdatePaymentTypeDto extends PartialType(CreatePaymentTypeDto) {}

export class CreateExpenseTypeDto extends NamedDto {
  @ApiProperty({ required: false, enum: ExpenseTarget, description: 'To`lov nimaga yoziladi' })
  @IsOptional()
  @IsIn(Object.values(ExpenseTarget), { message: 'Bog`lanish notog`ri tanlangan' })
  target?: ExpenseTarget;
}
export class UpdateExpenseTypeDto extends PartialType(CreateExpenseTypeDto) {}

/* ---------------------------------- To'lovlar --------------------------------- */

/** Yaratish va o'zgartirishda bir xil - yozuv har doim to'liq yuboriladi */
export class PaymentDto {
  @ApiProperty({ required: false, enum: PaymentDirection, description: 'EXPENSE - harajat (sukut), INCOME - pul tushumi' })
  @IsOptional()
  @IsIn(Object.values(PaymentDirection), { message: 'Yozuv turi notog`ri' })
  direction?: PaymentDirection;
  @ApiProperty({ required: false, example: '2026-09-30', description: 'Bo`sh bo`lsa - bugun' })
  @IsOptional() @ValidateIf(filled('paymentDate'))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana YYYY-MM-DD ko`rinishida bo`lishi kerak' })
  paymentDate?: string;

  @ApiProperty({ required: false, description: 'Harajatda shart' })
  @IsOptional() @ValidateIf(filled('expenseTypeId'))
  @IsUUID('4', { message: 'Harajat turi notog`ri tanlangan' })
  expenseTypeId?: string;

  @ApiProperty({ required: false, nullable: true, description: 'Harajat turi kirim hujjatiga bog`langan bo`lsa' })
  @IsOptional() @ValidateIf(filled('inboundDocumentId'))
  @IsUUID('4', { message: 'Kirim hujjati notog`ri tanlangan' })
  inboundDocumentId?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Tushum: pul qaysi sotuv bo`yicha tushdi' })
  @IsOptional() @ValidateIf(filled('outboundDocumentId'))
  @IsUUID('4', { message: 'Chiqim hujjati notog`ri tanlangan' })
  outboundDocumentId?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Harajatda bog`lanishga qarab; tushumda - kimdan' })
  @IsOptional() @ValidateIf(filled('contractorId'))
  @IsUUID('4', { message: 'Kontragent notog`ri tanlangan' })
  contractorId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('paymentTypeId'))
  @IsUUID('4', { message: 'To`lov turi notog`ri tanlangan' })
  paymentTypeId?: string | null;

  @ApiProperty({ description: 'Pul qaysi kassaga tushdi / qaysi kassadan chiqdi' })
  @IsUUID('4', { message: 'Kassa tanlanishi shart' })
  cashRegisterId: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Valyuta tanlanishi shart' })
  currencyId: string;

  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Summa son bo`lishi kerak (kasr qismi 2 xonagacha)' })
  @Min(0.01, { message: 'Summa noldan katta bo`lishi kerak' })
  @Max(9999999999999, { message: 'Summa juda katta' })
  amount: number;

  @ApiProperty({ required: false, example: 12650, description: '1 valyuta necha so`m. So`mda kerak emas' })
  @IsOptional() @ValidateIf(filled('rate'))
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Kurs son bo`lishi kerak (kasr qismi 4 xonagacha)' })
  @Min(0.0001, { message: 'Kurs noldan katta bo`lishi kerak' })
  @Max(99999999999, { message: 'Kurs juda katta' })
  rate?: number;

  @ApiProperty({ required: false, example: 18975000, description: 'So`mdagi summa. Berilmasa summa x kurs' })
  @IsOptional() @ValidateIf(filled('amountUzs'))
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'So`mdagi summa son bo`lishi kerak' })
  @Min(0.01, { message: 'So`mdagi summa noldan katta bo`lishi kerak' })
  @Max(9999999999999999, { message: 'So`mdagi summa juda katta' })
  amountUzs?: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}
