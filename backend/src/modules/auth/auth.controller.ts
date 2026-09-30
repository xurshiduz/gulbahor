import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, QrVerifyDto, FaceIdDto, FaceIdRegisterDto, GoogleLoginDto } from './dto/login.dto';
import { ChangePasswordDto, ImpersonateDto, SetLockPinDto, UpdateProfileDto, VerifyLockPinDto } from './dto/profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from './guards/permissions.guard';
import { clientIp, ipAllowed, networkStatus } from './network-restriction';
import { userIsSuperAdmin } from './permissions.util';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login va parol bilan kirish' })
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto.username, dto.password, req);
  }

  @Post('qr/generate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'QR beydjik yaratish (joriy foydalanuvchi)' })
  generateQr(@Req() req: any) {
    return this.authService.generateQrCode(req.user.id);
  }

  @Post('qr/verify')
  @ApiOperation({ summary: 'QR beydjik bilan kirish' })
  verifyQr(@Body() dto: QrVerifyDto, @Req() req: any) {
    return this.authService.verifyQrCode(dto.userId, dto.token, req);
  }

  @Post('faceid/register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'FaceID ni saqlash (joriy foydalanuvchi)' })
  registerFaceId(@Req() req: any, @Body() dto: FaceIdRegisterDto) {
    return this.authService.registerFaceId(req.user.id, dto.faceData);
  }

  @Post('faceid')
  @ApiOperation({ summary: 'FaceID bilan kirish' })
  faceIdLogin(@Body() dto: FaceIdDto, @Req() req: any) {
    return this.authService.faceIdLogin(dto.username, dto.faceData, req);
  }

  @Post('google')
  @ApiOperation({ summary: 'Google bilan kirish' })
  googleLogin(@Body() dto: GoogleLoginDto, @Req() req: any) {
    return this.authService.googleLogin(dto.token, req);
  }

  @Post('google/link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Google akkauntni profilga biriktirish' })
  linkGoogle(@Body() dto: GoogleLoginDto, @Req() req: any) {
    return this.authService.linkGoogleAccount(req.user.id, dto.token);
  }

  @Post('google/unlink')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Google akkauntni profildan uzish' })
  unlinkGoogle(@Req() req: any) {
    return this.authService.unlinkGoogleAccount(req.user.id);
  }

  /* --------------------------------- Profil -------------------------------- */

  @Put('profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Profil ma\'lumotlarini yangilash' })
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, dto.name, dto.phone);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Parolni o\'zgartirish (joriy parol bilan)' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.password);
  }

  /* --------------------------- Avtobloklash PIN -------------------------- */

  @Post('lock-pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Avtobloklash PIN kodi va vaqtini o\'rnatish' })
  setLockPin(@Req() req: any, @Body() dto: SetLockPinDto) {
    return this.authService.setLockPin(req.user.id, dto.pin, dto.autoLockMinutes);
  }

  @Delete('lock-pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Avtobloklashni o\'chirish' })
  clearLockPin(@Req() req: any) {
    return this.authService.clearLockPin(req.user.id);
  }

  @Post('lock-pin/verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Avtobloklash PIN kodini tekshirish' })
  verifyLockPin(@Req() req: any, @Body() dto: VerifyLockPinDto) {
    return this.authService.verifyLockPin(req.user.id, dto.pin);
  }

  /** Super admin xodim nomidan kiradi - PIN bilan; javob login bilan bir xil (token + user) */
  @Post('impersonate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Xodim nomidan kirish (faqat Super admin, PIN)' })
  impersonate(@Req() req: any, @Body() dto: ImpersonateDto) {
    return this.authService.impersonate(req.user, dto.userId, dto.pin, req);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Chiqish - seans yopiladi' })
  logout(@Req() req: any) {
    return this.authService.logout(req.user.sessionId);
  }

  /* ------------------------------ Kirish tarixi ----------------------------- */

  /** Bildirishnomalar: hisobga kirishlar (joriy seans belgilangan) */
  @Get('notifications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getNotifications(@Req() req: any) {
    return this.authService.getLoginNotifications(req.user.id, req.user.sessionId);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'O\'z kirish tarixi' })
  async getSessions(@Req() req: any) {
    const sessions = await this.authService.getLoginHistory(req.user.id);
    return sessions.map((s) => ({ ...s, isCurrent: s.id === req.user.sessionId }));
  }

  /** Foydalanuvchilar sahifasidagi "Tarix" - xodimning kirish tarixi */
  @Get('sessions/user/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('read:users')
  @ApiOperation({ summary: 'Xodimning kirish tarixi' })
  getUserSessions(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.authService.getLoginHistory(userId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'O\'zining boshqa seansini yopish' })
  terminateSession(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.authService.terminateSession(req.user.id, id, req.user.sessionId);
  }

  /** Tarmoq cheklovi diagnostikasi: server qaysi IP ni ko'ryapti, cheklov ishlayaptimi */
  @Get('network-check')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tarmoq cheklovi holati (Super admin)' })
  networkCheck(@Req() req: any) {
    if (!userIsSuperAdmin(req.user)) throw new ForbiddenException('Faqat Super admin');
    return networkStatus(req.user, req);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Joriy foydalanuvchi' })
  me(@Req() req: any) {
    // Login javobi bilan bir xil shakl: googleLinked kabi maydonlar yo'qolmasin
    // va qrSecret/faceIdData brauzerga chiqib ketmasin.
    // clientIp - tarmoq cheklovini tekshirish uchun (server qaysi IP ni ko'ryapti)
    return { ...this.authService.toPublicUser(req.user), clientIp: clientIp(req), insideNetwork: ipAllowed(clientIp(req)) };
  }
}
