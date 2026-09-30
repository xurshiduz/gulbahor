import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

/** Bo'sh satr yoki null bo'lsa tekshiruv o'tkazib yuboriladi (ixtiyoriy maydonlar) */
const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

class BaseDto {
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/* ------------------------------- Tashkilotlar ------------------------------ */

export class CreateOrganizationDto extends BaseDto {
  @ApiProperty({ example: 'Gulbahor Tekstil' })
  @IsString()
  @IsNotEmpty({ message: 'Tashkilot nomi kiritilishi shart' })
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
  @IsOptional() @ValidateIf(filled('vatCode'))
  @Matches(/^\d{12}$/, { message: 'QQS kodi 12 ta raqamdan iborat bo`lishi kerak' })
  vatCode?: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('oked'))
  @Matches(/^\d{4,6}$/, { message: 'IFUT (OKED) 4-6 ta raqamdan iborat bo`lishi kerak' })
  oked?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(255)
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('email'))
  @IsEmail({}, { message: 'Email formati notog`ri' })
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(160)
  director?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(160)
  accountant?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(160)
  bankName?: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('bankAccount'))
  @Matches(/^\d{20}$/, { message: 'Hisob raqami 20 ta raqamdan iborat bo`lishi kerak' })
  bankAccount?: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateIf(filled('mfo'))
  @Matches(/^\d{5}$/, { message: 'MFO 5 ta raqamdan iborat bo`lishi kerak' })
  mfo?: string;
}
export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

/* --------------------------------- Filiallar ------------------------------- */

export class CreateBranchDto extends BaseDto {
  @ApiProperty({ example: 'Chilonzor filiali' })
  @IsString()
  @IsNotEmpty({ message: 'Filial nomi kiritilishi shart' })
  @MaxLength(160)
  name: string;

  @ApiProperty({ required: false, description: 'Masul shaxs F.I.O' })
  @IsOptional() @IsString() @MaxLength(160)
  responsibleName?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(255)
  address?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @ValidateIf(filled('organizationId'))
  @IsUUID('4', { message: 'Tashkilot notog`ri tanlangan' })
  organizationId?: string | null;
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

/* ------------------------------- Omborxonalar ------------------------------ */

export class CreateWarehouseDto extends BaseDto {
  @ApiProperty({ example: 'Asosiy ombor' })
  @IsString()
  @IsNotEmpty({ message: 'Omborxona nomi kiritilishi shart' })
  @MaxLength(160)
  name: string;

  @ApiProperty()
  @IsUUID('4', { message: 'Filial tanlanishi shart' })
  branchId: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(160)
  responsibleName?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(255)
  address?: string;
}
export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}
