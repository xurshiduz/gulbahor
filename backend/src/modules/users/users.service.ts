import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { ADMIN_ROLE_PATTERN, SUPER_ADMIN_ROLE_PATTERN, userIsAdmin, userIsSuperAdmin } from '../auth/permissions.util';
import { SUPER_ADMIN } from '../roles/system-roles';
import { Branch } from '../administration/entities/branch.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '',
  э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** F.I.O -> login uchun asos: birinchi ikki so'z, nuqta bilan */
export function slugifyName(name: string) {
  const latin = (name || '')
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, '')
    .split('')
    .map((ch) => CYRILLIC_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return latin.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
}

/**
 * Parol uchun harflar: adashtiradigan belgilar yo'q (O, o, 0 va I, l, 1) -
 * xodim uni ko'chirib emas, o'qib yozishi mumkin.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH = 10;

function generatePassword() {
  let out = '';
  // randomInt - Math.random dan farqli, kriptografik manbadan
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

const roleName = (role: { name?: string }) => String(role?.name || '').trim();
const hasSuperAdminRole = (roles?: Role[]) => (roles || []).some((r) => SUPER_ADMIN_ROLE_PATTERN.test(roleName(r)));

/** Birinchi ishga tushishda yaratiladigan administrator logini */
export const DEFAULT_ADMIN_USERNAME = 'admin';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async findAll() {
    return this.userRepository.find({
      relations: ['roles', 'extraPermissions', 'branch'],
      select: {
        id: true, name: true, username: true, email: true, phone: true,
        avatarUrl: true, isActive: true, qrEnabled: true, faceIdEnabled: true,
        googleId: true,
        // Tashqaridan ishlashga ruxsat - forma shundan o'qiydi; bo'lmasa belgi
        // doim bo'sh ko'rinib, qayta saqlanganda o'chib ketardi
        remoteAccess: true,
        branchId: true,
        createdAt: true, updatedAt: true,
      },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions', 'extraPermissions', 'branch'],
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
  }

  async findByUsername(username: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'permissions')
      .leftJoinAndSelect('user.extraPermissions', 'extraPermissions')
      .leftJoinAndSelect('user.branch', 'branch')
      // Katta-kichik harf farq qilmasin: telefon klaviaturasi birinchi
      // harfni o'zi katta qiladi ("Aliyev.vali") va kirish rad etilardi
      .where('LOWER(user.username) = :username OR LOWER(user.email) = :username', {
        username: String(username || '').trim().toLowerCase(),
      })
      .getOne();
  }

  async findByGoogleId(googleId: string) {
    return this.userRepository.findOne({ where: { googleId }, relations: ['roles', 'roles.permissions', 'extraPermissions', 'branch'] });
  }

  /** Login band emasligini tekshiradi (katta-kichik harf farqsiz) */
  private async assertUsernameFree(username: string, excludeUserId?: string) {
    const existing = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :username', { username: username.toLowerCase() })
      .getOne();
    if (existing && existing.id !== excludeUserId) throw new ConflictException('Bunday login allaqachon mavjud');
  }

  async create(dto: CreateUserDto, actor?: any) {
    const requested = (dto.username || '').trim();
    if (requested) await this.assertUsernameFree(requested);

    // Login yuborilmasa - F.I.O dan yasaymiz (takrorlansa oxiriga raqam qo'shiladi)
    const username = requested || (await this.generateUsername(dto.name));

    const { extraPermissionIds, roleIds, remoteAccess, branchId, ...fields } = dto;
    const user = this.userRepository.create({ ...fields, username });
    if (branchId) user.branch = await this.findBranch(branchId);
    // "Tashqaridan ishlashga ruxsat" ni faqat Super admin qo'yadi
    if (remoteAccess !== undefined && userIsSuperAdmin(actor)) user.remoteAccess = remoteAccess;
    if (roleIds?.length) {
      user.roles = await this.roleRepository.findBy({ id: In(roleIds) });
      this.assertCanAssign(user.roles, actor);
    }
    if (extraPermissionIds?.length) {
      this.assertCanGrantExtra(actor);
      user.extraPermissions = await this.permissionRepository.findBy({ id: In(extraPermissionIds) });
    }
    const saved = await this.userRepository.save(user);
    this.logger.log(`${saved.username}: foydalanuvchi yaratildi (${actor?.username || 'tizim'})`);
    return this.findOne(saved.id);
  }

  private async findBranch(id: string) {
    const branch = await this.branchRepository.findOne({ where: { id } });
    if (!branch) throw new BadRequestException('Filial topilmadi');
    return branch;
  }

  /**
   * Admin va Super admin rolini faqat Super admin bera oladi. Oddiy Admin
   * o'ziga teng yoki yuqori rolni tarqatib yubormasin.
   */
  private assertCanAssign(roles: Role[], actor: any, previous: Role[] = []) {
    if (!actor || userIsSuperAdmin(actor)) return;
    const had = new Set(previous.map((r) => r.id));
    // Faqat YANGI qo'shilayotgan rollar tekshiriladi - avvaldan bori o'z joyida qoladi
    const restricted = roles.filter((role) => !had.has(role.id) && ADMIN_ROLE_PATTERN.test(roleName(role)));
    if (restricted.length) {
      throw new ForbiddenException(
        `"${restricted.map((r) => r.name).join('", "')}" rolini faqat Super admin bera oladi`,
      );
    }
  }

  /**
   * Qo'shimcha huquqlarni faqat Admin/Super admin beradi: aks holda
   * "Foydalanuvchilar: o'zgartirish" huquqi bor xodim o'ziga istalgan huquqni yozib olardi.
   */
  private assertCanGrantExtra(actor: any) {
    if (actor && !userIsAdmin(actor)) {
      throw new ForbiddenException("Qo'shimcha huquqlarni faqat Admin bera oladi");
    }
  }

  /**
   * O'zidan yuqori turgan foydalanuvchiga tegib bo'lmaydi: Super adminga
   * faqat Super admin, Adminga faqat Admin/Super admin. Aks holda
   * "Foydalanuvchilar: o'zgartirish" huquqi bor xodim admin parolini
   * yangilab, uning nomidan kirib olardi.
   */
  private assertCanManage(user: User, actor: any, action: string) {
    if (!actor) return;
    if (hasSuperAdminRole(user.roles) && !userIsSuperAdmin(actor)) {
      throw new ForbiddenException(`Super admin foydalanuvchini faqat Super admin ${action}`);
    }
    if (userIsAdmin(user) && !userIsAdmin(actor)) {
      throw new ForbiddenException(`Admin foydalanuvchini faqat Admin ${action}`);
    }
  }

  /** Tizimda kamida bitta faol Super admin qolishi shart */
  private async assertNotLastSuperAdmin(user: User, action: string) {
    if (!hasSuperAdminRole(user.roles)) return;
    const others = await this.userRepository
      .createQueryBuilder('u')
      .innerJoin('u.roles', 'r', 'r.name = :name', { name: SUPER_ADMIN })
      .where('u.id != :id AND u.isActive = true', { id: user.id })
      .getCount();
    if (!others) throw new BadRequestException(`Oxirgi Super adminni ${action} bo'lmaydi`);
  }

  async update(id: string, dto: UpdateUserDto, actor?: any) {
    const user = await this.findOne(id);
    this.assertCanManage(user, actor, "o'zgartira oladi");

    const newUsername = (dto.username || '').trim();
    if (newUsername && newUsername.toLowerCase() !== user.username.toLowerCase()) {
      await this.assertUsernameFree(newUsername, id);
    }

    // Parol bu yerda o'zgarmaydi: xodim o'zi profildan, admin esa "Parolni yangilash" orqali
    const { password, roleIds, extraPermissionIds, remoteAccess, branchId, ...rest } = dto;
    Object.assign(user, rest);
    // Filial: bo'sh satr yoki null - biriktirishni olib tashlash
    if (branchId !== undefined) {
      user.branch = branchId ? await this.findBranch(branchId) : null;
      user.branchId = user.branch?.id || null;
    }
    if (newUsername) user.username = newUsername;
    // "Tashqaridan ishlashga ruxsat" ni faqat Super admin o'zgartiradi
    if (remoteAccess !== undefined && userIsSuperAdmin(actor)) user.remoteAccess = remoteAccess;

    if (roleIds) {
      const previous = user.roles || [];
      const next = await this.roleRepository.findBy({ id: In(roleIds) });
      this.assertCanAssign(next, actor, previous);
      if (hasSuperAdminRole(previous) && !hasSuperAdminRole(next)) {
        await this.assertNotLastSuperAdmin(user, 'roldan chiqarib');
      }
      user.roles = next;
    }
    // Qo'shimcha huquqlar - bo'sh ro'yxat yuborilsa hammasi olib tashlanadi
    if (extraPermissionIds) {
      this.assertCanGrantExtra(actor);
      user.extraPermissions = extraPermissionIds.length
        ? await this.permissionRepository.findBy({ id: In(extraPermissionIds) })
        : [];
    }
    await this.userRepository.save(user);
    return this.findOne(id);
  }

  /**
   * F.I.O dan login yasaydi: "Turdiyev Alisher Baxtiyorovich" -> "turdiyev.alisher".
   * Kirill va o'zbekcha harflar lotinga o'giriladi, band bo'lsa oxiriga raqam qo'shiladi.
   */
  async generateUsername(name: string) {
    const base = slugifyName(name) || 'user';

    let candidate = base;
    let suffix = 1;
    while (await this.userRepository.findOne({ where: { username: candidate } })) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }

  async remove(id: string, actor?: any) {
    const user = await this.findOne(id);
    if (actor && user.id === actor.id) throw new ForbiddenException("O'zingizni o'chira olmaysiz");
    this.assertCanManage(user, actor, "o'chira oladi");
    await this.assertNotLastSuperAdmin(user, "o'chirib");
    await this.userRepository.remove(user);
    this.logger.log(`${user.username}: foydalanuvchi o'chirildi (${actor?.username || 'tizim'})`);
    return { success: true };
  }

  /* --------------------------- Faollik va parol --------------------------- */

  /** Hisobni ochadi - xodim yana tizimga kira oladi */
  async activate(id: string, actor?: any) {
    const user = await this.findOne(id);
    this.assertCanManage(user, actor, 'aktivlashtira oladi');
    if (!user.isActive) {
      user.isActive = true;
      await this.userRepository.save(user);
      this.logger.log(`${user.username}: hisob aktivlashtirildi`);
    }
    return this.findOne(id);
  }

  /** Hisobni yopadi - kira olmaydi, lekin ma'lumotlari joyida qoladi */
  async deactivate(id: string, actor?: any) {
    const user = await this.findOne(id);
    if (actor && user.id === actor.id) throw new ForbiddenException("O'z hisobingizni yopa olmaysiz");
    this.assertCanManage(user, actor, 'yopa oladi');
    await this.assertNotLastSuperAdmin(user, 'yopib');
    user.isActive = false;
    await this.userRepository.save(user);
    this.logger.log(`${user.username}: hisob yopildi`);
    return this.findOne(id);
  }

  /**
   * Administrator xodimga yangi parol beradi (eskisini unutgan bo'lsa).
   *
   * Parol shu yerda yasaladi va javobda BIR MARTA qaytadi - bazada faqat
   * bcrypt xeshi turadi. Administrator uni xodimga yetkazadi, xodim esa
   * profilidan o'zgartirib oladi.
   */
  async resetPassword(id: string, actor?: any) {
    const user = await this.findOne(id);
    this.assertCanManage(user, actor, 'parolini yangilay oladi');
    const password = generatePassword();
    await this.userRepository.update(user.id, { password: await bcrypt.hash(password, 10) });
    this.logger.log(`${user.username}: parol yangilandi (${actor?.username || 'tizim'})`);
    return { username: user.username, password };
  }

  /* ------------------------ Kirish usullari (auth) ------------------------ */

  async updateQrSecret(userId: string, secret: string) {
    await this.userRepository.update(userId, { qrSecret: secret, qrEnabled: true });
  }

  async updateFaceId(userId: string, faceIdData: string) {
    await this.userRepository.update(userId, { faceIdData, faceIdEnabled: true });
  }

  /** googleId = null - akkaunt uziladi */
  async linkGoogleId(userId: string, googleId: string | null, email?: string) {
    const updateData: Partial<User> = { googleId };
    // Email bo'sh bo'lsagina Google'dagisi yoziladi - admin kiritgani ustidan yozilmaydi
    if (email) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user && !user.email) updateData.email = email;
    }
    await this.userRepository.update(userId, updateData);
  }

  /* --------------------------------- Profil -------------------------------- */

  async updateProfile(userId: string, name: string, phone?: string) {
    const update: Partial<User> = { name: String(name || '').trim() };
    if (phone !== undefined) update.phone = String(phone || '').trim() || null;
    await this.userRepository.update(userId, update);
  }

  /**
   * Avtobloklash PIN kodini o'rnatadi. PIN xeshlanadi - parol bilan bir xil
   * qoida. Daqiqa 1..60 oralig'ida bo'lishi kerak.
   */
  async setLockPin(userId: string, pin: string, autoLockMinutes: number) {
    if (!/^\d{4}$/.test(pin || '')) {
      throw new BadRequestException("PIN kod 4 ta raqamdan iborat bo'lishi kerak");
    }
    const minutes = Number(autoLockMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      throw new BadRequestException("Daqiqa 1 dan 60 gacha bo'lishi kerak");
    }

    await this.userRepository.update(userId, {
      lockPin: await bcrypt.hash(pin, 10),
      lockPinEnabled: true,
      autoLockMinutes: minutes,
    });
    return this.findOne(userId);
  }

  /** Avtobloklashni o'chiradi */
  async clearLockPin(userId: string) {
    await this.userRepository.update(userId, { lockPin: null, lockPinEnabled: false, autoLockMinutes: null });
    return this.findOne(userId);
  }

  /**
   * PIN to'g'riligini tekshiradi. lockPin ustuni select: false bo'lgani uchun
   * alohida so'raladi.
   */
  async verifyLockPin(userId: string, pin: string) {
    const row = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.lockPin')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!row?.lockPin) return false;
    return bcrypt.compare(String(pin || ''), row.lockPin);
  }

  /** Joriy parolni tekshiradi (parolni o'zgartirishdan oldin) */
  async verifyPassword(userId: string, password: string) {
    const row = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!row?.password) return false;
    return bcrypt.compare(String(password || ''), row.password);
  }

  async changePassword(userId: string, newPassword: string) {
    await this.userRepository.update(userId, { password: await bcrypt.hash(newPassword, 10) });
  }

  /* ---------------------------------- Seed --------------------------------- */

  /**
   * Birinchi ishga tushish: tizimda bitta ham Super admin bo'lmasa
   * administrator yaratiladi. Parol ADMIN_PASSWORD (.env) dan, berilmasa
   * standart - birinchi kirishdan keyin profildan o'zgartirish SHART.
   */
  async seedAdmin() {
    const superRole = await this.roleRepository.findOne({ where: { name: SUPER_ADMIN } });
    if (!superRole) return;

    const holders = await this.userRepository
      .createQueryBuilder('u')
      .innerJoin('u.roles', 'r', 'r.id = :id', { id: superRole.id })
      .getCount();
    if (holders) return;

    const existing = await this.userRepository.findOne({
      where: { username: DEFAULT_ADMIN_USERNAME },
      relations: ['roles'],
    });
    if (existing) {
      existing.roles = [...(existing.roles || []), superRole];
      existing.isActive = true;
      await this.userRepository.save(existing);
      this.logger.warn(`Super admin yo'q edi - "${DEFAULT_ADMIN_USERNAME}" ga Super admin roli berildi`);
      return;
    }

    const fromEnv = process.env.ADMIN_PASSWORD?.trim();
    const user = this.userRepository.create({
      name: 'Administrator',
      username: DEFAULT_ADMIN_USERNAME,
      password: fromEnv || 'admin123', // entity @BeforeInsert da xeshlaydi
      isActive: true,
      roles: [superRole],
    });
    await this.userRepository.save(user);
    this.logger.warn(
      fromEnv
        ? `Administrator yaratildi: ${DEFAULT_ADMIN_USERNAME} (parol .env dagi ADMIN_PASSWORD)`
        : `Administrator yaratildi: ${DEFAULT_ADMIN_USERNAME} / admin123 - parolni darhol o'zgartiring!`,
    );
  }
}
