import { IsString, IsOptional, IsEmail, IsArray, IsUUID, MinLength, IsNotEmpty, ValidateIf, Matches, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'F.I.O' })
  @IsString()
  @IsNotEmpty({ message: 'F.I.O kiritilishi shart' })
  name: string;

  // Yuborilmasa - F.I.O dan avtomatik yasaladi (UsersService.create)
  @ApiProperty({ required: false, description: 'Login. Bo\'sh bo\'lsa F.I.O dan generatsiya qilinadi' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: "Login faqat harf, raqam, '.' va '_' belgilaridan iborat bo'lishi kerak",
  })
  username?: string;

  @ApiProperty()
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 ta belgi bo'lishi kerak" })
  password: string;

  // Email majburiy emas; bo'sh satr yuborilsa ham tekshiruvdan o'tkazmaymiz
  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail({}, { message: 'Email formati noto\'g\'ri' })
  email?: string;

  @ApiProperty({ description: 'Telefon raqam: +998XXXXXXXXX', example: '+998901234567' })
  @IsString()
  @IsNotEmpty({ message: 'Telefon raqam kiritilishi shart' })
  @Matches(/^\+998\d{9}$/, {
    message: "Telefon raqam +998XXXXXXXXX ko'rinishida bo'lishi kerak",
  })
  phone: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];

  /** Rol huquqlaridan tashqari, shu xodimga alohida beriladigan huquqlar */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  extraPermissionIds?: string[];

  /** Tashqaridan ishlashga ruxsat - faqat Super admin o'zgartiradi */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  remoteAccess?: boolean;

  /** Xodim ishlaydigan filial; null yoki bo'sh - biriktirilmagan */
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.branchId !== null && o.branchId !== '')
  @IsUUID('4', { message: 'Filial notog`ri tanlangan' })
  branchId?: string | null;
}
