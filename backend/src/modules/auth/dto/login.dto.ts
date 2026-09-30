import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  password: string;
}

export class QrVerifyDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsString()
  token: string;
}

export class FaceIdDto {
  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  faceData: string; // JSON string of face descriptor array
}

export class FaceIdRegisterDto {
  @ApiProperty()
  @IsString()
  faceData: string;
}

export class GoogleLoginDto {
  @ApiProperty()
  @IsString()
  token: string;
}
