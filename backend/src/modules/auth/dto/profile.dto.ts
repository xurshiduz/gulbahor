import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Ism-familiya kiritilishi shart' })
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Joriy parol' })
  @IsString()
  @IsNotEmpty({ message: 'Joriy parol kiritilishi shart' })
  currentPassword: string;

  @ApiProperty({ description: 'Yangi parol' })
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 ta belgi bo'lishi kerak" })
  password: string;
}

export class SetLockPinDto {
  @ApiProperty({ example: '1234' })
  @IsString()
  @Matches(/^\d{4}$/, { message: "PIN kod 4 ta raqamdan iborat bo'lishi kerak" })
  pin: string;

  @ApiProperty({ example: 15 })
  @IsInt({ message: "Daqiqa butun son bo'lishi kerak" })
  @Min(1, { message: "Daqiqa 1 dan 60 gacha bo'lishi kerak" })
  @Max(60, { message: "Daqiqa 1 dan 60 gacha bo'lishi kerak" })
  autoLockMinutes: number;
}

export class VerifyLockPinDto {
  @ApiProperty()
  @IsString()
  pin: string;
}

export class ImpersonateDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsString()
  pin: string;
}
