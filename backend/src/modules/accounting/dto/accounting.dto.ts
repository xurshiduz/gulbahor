import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

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

export class CreateExpenseTypeDto extends NamedDto {}
export class UpdateExpenseTypeDto extends PartialType(CreateExpenseTypeDto) {}
