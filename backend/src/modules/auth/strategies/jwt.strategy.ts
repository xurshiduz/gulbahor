import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { LoginHistory } from '../entities/login-history.entity';

/**
 * Sessiya oxirgi so'rovdan keyin qancha vaqt "tirik" turadi (daqiqada).
 * Ish kuni davomida qayta-qayta login qilmaslik uchun 8 soat. Qisqa
 * muddatli himoyani profildagi "Avtobloklash PIN kod" beradi: u sessiyani
 * yopmaydi, faqat ekranni bloklab PIN so'raydi.
 */
const DEFAULT_IDLE_TIMEOUT_MINUTES = 480; // 8 soat
/** lastActivityAt ni har so'rovda emas, shu oraliqdan keyin yangilaymiz */
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly idleTimeoutMs: number;

  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    @InjectRepository(LoginHistory)
    private readonly loginHistoryRepository: Repository<LoginHistory>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });

    const minutes = Number(
      configService.get('SESSION_IDLE_TIMEOUT_MINUTES', DEFAULT_IDLE_TIMEOUT_MINUTES),
    );
    this.idleTimeoutMs =
      (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_IDLE_TIMEOUT_MINUTES) * 60 * 1000;
  }

  async validate(payload: { sub: string; username: string; sessionId?: string }) {
    const user = await this.usersService.findOne(payload.sub).catch(() => null);
    if (!user || !user.isActive) throw new UnauthorizedException();

    // Har bir token kirish tarixidagi seansga bog'langan: seans yopilgan
    // (chiqish, boshqa qurilmadan yopish, harakatsizlik) bo'lsa token ham ishlamaydi.
    const session = payload.sessionId
      ? await this.loginHistoryRepository.findOne({ where: { id: payload.sessionId } })
      : null;
    if (!session || session.userId !== user.id) throw new UnauthorizedException();
    if (session.logoutAt) throw new UnauthorizedException('Sessiya yopilgan');

    // Harakatsizlik nazorati. Frontend ham o'z taymeriga ega, bu esa server tomonidagi kafolat.
    const lastActivity = new Date(session.lastActivityAt ?? session.loginAt).getTime();
    const idleMs = Date.now() - lastActivity;

    if (idleMs > this.idleTimeoutMs) {
      await this.loginHistoryRepository.update(session.id, { logoutAt: new Date() });
      throw new UnauthorizedException('Harakatsizlik sababli sessiya tugadi');
    }

    if (idleMs > ACTIVITY_WRITE_THROTTLE_MS) {
      await this.loginHistoryRepository.update(session.id, { lastActivityAt: new Date() });
    }

    // sessionId - qaysi seansdan foydalanilayotganini bilish uchun (chiqish, bildirishnomalar)
    return { ...user, sessionId: session.id };
  }
}
