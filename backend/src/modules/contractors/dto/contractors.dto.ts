import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { SupplierKind } from '../entities/contractor.entity';

/** Bo'sh satr yoki null bo'lsa tekshiruv o'tkazib yuboriladi (ixtiyoriy maydonlar) */
const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

/** Mijoz va yetkazib beruvchida umumiy maydonlar */
class ContractorDto {
  @ApiProperty({ example: 'Baraka Savdo' })
  @IsString()
  @IsNotEmpty({ message: 'Nom kiritilishi shart' })
  @MaxLength(160)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(255)
  fullName?: string;

  @ApiProperty({ required: false, example: '301234567' })
  @IsOptional() @ValidateIf(filled('inn'))
  @Matches(/^\d{9}$/, { message: 'STIR 9 ta raqamdan iborat bo`lishi kerak' })
  inn?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(160)
  contactPerson?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('email'))
  @IsEmail({}, { message: 'Email formati notog`ri' })
  email?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('regionId'))
  @IsUUID('4', { message: 'Viloyat notog`ri tanlangan' })
  regionId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(255)
  address?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('currencyId'))
  @IsUUID('4', { message: 'Valyuta notog`ri tanlangan' })
  currencyId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(160)
  bankName?: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('bankAccount'))
  @Matches(/^[A-Za-z0-9]{8,34}$/, { message: 'Hisob raqami 8-34 ta harf va raqamdan iborat bo`lishi kerak' })
  bankAccount?: string;

  @ApiProperty({ required: false, description: 'MFO yoki SWIFT' })
  @IsOptional() @ValidateIf(filled('bankCode'))
  @Matches(/^[A-Za-z0-9]{5,11}$/, { message: 'MFO 5 ta raqam, SWIFT 8-11 ta belgi bo`lishi kerak' })
  bankCode?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCustomerDto extends ContractorDto {
  // Mijozda telefon majburiy (umumiy qismda ixtiyoriy edi)
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @IsNotEmpty({ message: 'Telefon raqam kiritilishi shart' })
  @MaxLength(30)
  @Matches(/^\+?[\d\s()-]{7,30}$/, { message: 'Telefon raqam notog`ri' })
  phone: string;

  @ApiProperty({ example: '1990-05-17', description: 'Tug`ilgan kun' })
  @IsNotEmpty({ message: 'Tug`ilgan kun kiritilishi shart' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tug`ilgan kun YYYY-MM-DD ko`rinishida bo`lishi kerak' })
  birthDate: string;
}
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CreateSupplierDto extends ContractorDto {
  @ApiProperty({ enum: SupplierKind, description: 'Mahalliy yoki import' })
  @IsIn(Object.values(SupplierKind), { message: 'Yetkazib beruvchi turi tanlanishi shart (mahalliy yoki import)' })
  supplierKind: SupplierKind;

  @ApiProperty({ required: false, nullable: true, description: 'Import uchun majburiy' })
  @IsOptional() @ValidateIf(filled('countryId'))
  @IsUUID('4', { message: 'Davlat notog`ri tanlangan' })
  countryId?: string | null;
}
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
