import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as qrcode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';
import { LoginHistory } from './entities/login-history.entity';
import { assertInsideNetwork, clientIp } from './network-restriction';
import { userIsSuperAdmin } from './permissions.util';

/**
 * Admin xodim nomidan kirishi uchun PIN. .env da IMPERSONATE_PIN bilan
 * o'zgartiriladi. Bu qo'shimcha to'siq, xolos - asosiy cheklov Super admin roli.
 */
const IMPERSONATE_PIN = process.env.IMPERSONATE_PIN || '0009';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(LoginHistory)
    private readonly loginHistoryRepository: Repository<LoginHistory>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive) throw new UnauthorizedException("Login yoki parol noto'g'ri");
    const isValid = await user.validatePassword(password);
    if (!isValid) throw new UnauthorizedException("Login yoki parol noto'g'ri");
    return user;
  }

  async generateToken(user: any, req?: any, opts: { skipNetworkCheck?: boolean; device?: string } = {}) {
    // Tarmoq cheklovi yoqilgan bo'lsa: tashqaridan kirish darhol rad etiladi
    if (req && !opts.skipNetworkCheck) assertInsideNetwork(user, req);

    // Kirish tarixi: har bir kirish alohida seans
    const session = await this.loginHistoryRepository.save(
      this.loginHistoryRepository.create({
        userId: user.id,
        ipAddress: (req && clientIp(req)) || 'Unknown',
        device: opts.device || req?.headers?.['user-agent'] || 'Unknown',
      }),
    );

    const payload = { sub: user.id, username: user.username, sessionId: session.id };
    return {
      accessToken: this.jwtService.sign(payload),
      user: this.toPublicUser(user),
    };
  }

  /**
   * Brauzerga yuboriladigan foydalanuvchi ma'lumoti.
   *
   * Login ham, /me ham AYNAN shu shaklni qaytarishi kerak - aks holda
   * sahifa yangilangach maydonlar yo'qolib, sozlamalar o'chirilgandek
   * ko'rinadi. Maxfiy maydonlar (qrSecret, faceIdData) bu yerga tushmaydi.
   */
  toPublicUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      roles: user.roles,
      // Qo'shimcha huquqlar (rol huquqlaridan tashqari) - frontend huquqlarga qo'shib oladi
      extraPermissions: (user.extraPermissions || []).map((p: any) => ({ id: p.id, name: p.name })),
      qrEnabled: user.qrEnabled,
      faceIdEnabled: user.faceIdEnabled,
      googleLinked: !!user.googleId,
      // Ekranni avtomatik bloklash sozlamasi (PIN xeshi hech qachon chiqmaydi)
      lockPinEnabled: !!user.lockPinEnabled,
      autoLockMinutes: user.autoLockMinutes ?? null,
      // Xodimning filiali - sarlavhada va keyinchalik hujjatlarda ko'rinadi
      branch: user.branch ? { id: user.branch.id, name: user.branch.name } : null,
    };
  }

  async logout(sessionId: string) {
    if (sessionId) {
      await this.loginHistoryRepository.update(sessionId, { logoutAt: new Date() });
    }
    return { success: true };
  }

  /**
   * Bildirishnomalar: hisobga oxirgi kirishlar.
   *
   * Foydalanuvchi o'z hisobiga boshqa qurilmadan (yoki admin uning
   * nomidan) kirilganini ko'rsin. Joriy seans alohida belgilanadi, admin
   * nomidan kirilgan seansda "user-agent" oldida "[Ism nomidan]" turadi.
   */
  async getLoginNotifications(userId: string, currentSessionId?: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sessions = await this.loginHistoryRepository
      .createQueryBuilder('s')
      .where('s.userId = :userId AND s.loginAt >= :since', { userId, since })
      .orderBy('s.loginAt', 'DESC')
      .take(30)
      .getMany();

    return sessions.map((session) => {
      const device = String(session.device || '');
      const impersonated = device.match(/^\[(.+?) nomidan\]\s*/);
      return {
        id: session.id,
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        ipAddress: session.ipAddress,
        device: impersonated ? device.slice(impersonated[0].length) : device,
        impersonatedBy: impersonated ? impersonated[1] : null,
        isCurrent: !!currentSessionId && session.id === currentSessionId,
      };
    });
  }

  /** Kirish tarixi - oxirgi 50 ta seans */
  async getLoginHistory(userId: string) {
    return this.loginHistoryRepository.find({
      where: { userId },
      order: { loginAt: 'DESC' },
      take: 50,
    });
  }

  /** O'zining boshqa (joriy bo'lmagan) seansini yopadi - o'sha qurilma tizimdan chiqadi */
  async terminateSession(userId: string, sessionId: string, currentSessionId?: string) {
    if (sessionId === currentSessionId) {
      throw new BadRequestException('Joriy seansni bu yerdan yopib bo`lmaydi - "Chiqish" tugmasidan foydalaning');
    }
    const session = await this.loginHistoryRepository.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new BadRequestException('Seans topilmadi');
    if (!session.logoutAt) {
      await this.loginHistoryRepository.update(session.id, { logoutAt: new Date() });
    }
    return { success: true };
  }

  /**
   * Admin xodim nomidan tizimga kiradi - parolini bilmasdan.
   *
   * Xodim nimani ko'rayotganini tekshirish, u "menda ochilmayapti" deganda
   * o'sha ko'z bilan qarash uchun. Kirish tarixida alohida yozuv qoladi:
   * qurilma ustunida kim nomidan kirilgani ko'rsatiladi. Faqat Super admin.
   */
  async impersonate(admin: any, targetUserId: string, pin: string, req?: any) {
    if (!userIsSuperAdmin(admin)) throw new ForbiddenException('Xodim nomidan faqat Super admin kira oladi');
    if (String(pin || '') !== IMPERSONATE_PIN) throw new UnauthorizedException("PIN kod noto'g'ri");

    const target = await this.usersService.findOne(targetUserId);
    if (!target || target.isActive === false) throw new UnauthorizedException('Xodim faol emas');
    if (target.id === admin.id) throw new ForbiddenException("O'zingiz nomingizdan allaqachon kirgansiz");

    // Kirish tarixida qurilma ustunida kim nomidan kirilgani ko'rinsin
    const device = `[${admin.name || admin.username} nomidan] ${req?.headers?.['user-agent'] || ''}`.trim();
    return this.generateToken(target, req, { skipNetworkCheck: true, device });
  }

  async login(username: string, password: string, req?: any) {
    const user = await this.validateUser(username, password);
    return this.generateToken(user, req);
  }

  /* ------------------------------- QR beydjik ------------------------------ */

  async generateQrCode(userId: string) {
    // Beydjik uchun doimiy tasodifiy token (kriptografik manbadan)
    const secret = randomBytes(24).toString('hex');
    await this.usersService.updateQrSecret(userId, secret);

    const qrData = JSON.stringify({ userId, token: secret });
    const qrCodeUrl = await qrcode.toDataURL(qrData);

    return { qrCodeUrl };
  }

  async verifyQrCode(userId: string, token: string, req?: any) {
    const user = await this.usersService.findOne(userId).catch(() => null);
    if (!user?.qrSecret || user.qrSecret !== token) {
      throw new UnauthorizedException('QR kod yaroqsiz');
    }
    if (user.isActive === false) throw new UnauthorizedException('Xodim faol emas');
    return this.generateToken(user, req);
  }

  /* --------------------------------- FaceID -------------------------------- */

  async registerFaceId(userId: string, faceData: string) {
    let descriptor: unknown;
    try {
      descriptor = JSON.parse(faceData);
    } catch {
      throw new BadRequestException("Yuz ma'lumoti formati noto'g'ri");
    }
    if (!Array.isArray(descriptor) || descriptor.length !== 128 || descriptor.some((n) => typeof n !== 'number')) {
      throw new BadRequestException("Yuz ma'lumoti formati noto'g'ri");
    }
    await this.usersService.updateFaceId(userId, faceData);
    return { success: true };
  }

  async faceIdLogin(username: string, faceData: string, req?: any) {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive || !user.faceIdEnabled || !user.faceIdData) {
      throw new UnauthorizedException('Bu foydalanuvchi uchun FaceID yoqilmagan');
    }

    try {
      const storedDescriptor = JSON.parse(user.faceIdData);
      const incomingDescriptor = JSON.parse(faceData);

      if (storedDescriptor.length !== 128 || incomingDescriptor.length !== 128) {
        throw new Error();
      }

      // Evklid masofasi
      let distance = 0;
      for (let i = 0; i < 128; i++) {
        distance += Math.pow(storedDescriptor[i] - incomingDescriptor[i], 2);
      }
      distance = Math.sqrt(distance);

      // NaN ham rad etiladi (noto'g'ri sonlar yuborilsa)
      if (!(distance <= 0.5)) {
        throw new UnauthorizedException('Yuz mos kelmadi');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException("Yuz ma'lumoti formati noto'g'ri");
    }

    return this.generateToken(user, req);
  }

  /* --------------------------------- Google -------------------------------- */

  private async verifyGoogleToken(token: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new BadRequestException('Google orqali kirish sozlanmagan (GOOGLE_CLIENT_ID)');
    try {
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({ idToken: token, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) throw new Error('No email or sub in token');
      return payload;
    } catch {
      throw new UnauthorizedException('Google tokeni yaroqsiz yoki tarmoq xatosi');
    }
  }

  async googleLogin(token: string, req?: any) {
    const payload = await this.verifyGoogleToken(token);

    // 1. Avval aynan Google ID (sub) bo'yicha qidiramiz (oldin biriktirilgan bo'lsa)
    let user = await this.usersService.findByGoogleId(payload.sub);

    // 2. Topilmasa - tasdiqlangan email bo'yicha; topilsa avtomatik biriktiramiz
    if (!user && payload.email_verified) {
      user = await this.usersService.findByUsername(payload.email);
      if (user) await this.usersService.linkGoogleId(user.id, payload.sub);
    }

    // 3. Umuman topilmasa - xato (avtomatik yaratilmaydi)
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Ushbu Google akkaunt tizimda ro'yxatdan o'tmagan yoki biriktirilmagan.");
    }
    return this.generateToken(user, req);
  }

  async linkGoogleAccount(userId: string, token: string) {
    const payload = await this.verifyGoogleToken(token);

    // Shu Google akkaunt boshqa profilga biriktirilmaganmi
    const existingGoogleUser = await this.usersService.findByGoogleId(payload.sub);
    if (existingGoogleUser && existingGoogleUser.id !== userId) {
      throw new UnauthorizedException('Bu Google akkaunt allaqachon boshqa profilga biriktirilgan!');
    }

    await this.usersService.linkGoogleId(userId, payload.sub, payload.email);
    return { user: this.toPublicUser(await this.usersService.findOne(userId)) };
  }

  async unlinkGoogleAccount(userId: string) {
    await this.usersService.linkGoogleId(userId, null);
    return { user: this.toPublicUser(await this.usersService.findOne(userId)) };
  }

  /* --------------------------------- Profil -------------------------------- */

  /** Seans o'zgarmaydi - faqat foydalanuvchi ma'lumoti yangilanadi */
  async updateProfile(userId: string, name: string, phone?: string) {
    await this.usersService.updateProfile(userId, name, phone);
    return { user: this.toPublicUser(await this.usersService.findOne(userId)) };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const ok = await this.usersService.verifyPassword(userId, currentPassword);
    if (!ok) throw new BadRequestException("Joriy parol noto'g'ri");
    await this.usersService.changePassword(userId, newPassword);
    return { user: this.toPublicUser(await this.usersService.findOne(userId)) };
  }

  /* --------------------------- Avtobloklash PIN -------------------------- */

  async setLockPin(userId: string, pin: string, autoLockMinutes: number) {
    const user = await this.usersService.setLockPin(userId, pin, autoLockMinutes);
    return this.toPublicUser(user);
  }

  async clearLockPin(userId: string) {
    const user = await this.usersService.clearLockPin(userId);
    return this.toPublicUser(user);
  }

  async verifyLockPin(userId: string, pin: string) {
    const ok = await this.usersService.verifyLockPin(userId, pin);
    if (!ok) throw new UnauthorizedException("PIN kod noto'g'ri");
    return { success: true };
  }
}
