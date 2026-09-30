import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { SYSTEM_ROLES } from '../roles/system-roles';
import { RoleSeed } from '../roles/entities/role-seed.entity';

/** Bitta bo'lim (resurs) va uning huquqlari */
interface PermissionGroup {
  resource: string;
  resourceLabel: string;
  actions: { action: string; label: string }[];
}

const VIEW = { action: 'read', label: "Ko'rish" };
const CREATE = { action: 'create', label: "Qo'shish" };
const UPDATE = { action: 'update', label: "O'zgartirish" };
const DELETE = { action: 'delete', label: "O'chirish" };
const BLOCK = { action: 'block', label: 'Bloklash' };

/** Ko'p bo'limlarda takrorlanadigan to'liq to'plam */
const FULL = [VIEW, CREATE, UPDATE, DELETE];

/**
 * Tizimdagi huquqlar ro'yxati. Huquq nomi `${action}:${resource}`.
 *
 * Shu ro'yxatda yo'q huquqlar server ishga tushganda bazadan o'chiriladi
 * (rollardagi bog'lanishlari bilan birga). Yangi bo'lim qo'shish uchun
 * shu massivga yozish yetarli - frontendda esa config/modules.tsx va
 * layout/AppSidebar.tsx ga shu `resource` bilan punkt qo'shiladi.
 */
const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    // "Ko'rish" hammada bo'lishi kerak - Bosh sahifa menyudan yashirilmaydi
    resource: 'dashboard',
    resourceLabel: 'Bosh sahifa',
    actions: [VIEW],
  },
  // Bosh sahifadagi rahbar hisoboti: butun kompaniya savdosi, foydasi, harajatlari
  { resource: 'executive-report', resourceLabel: 'Rahbar hisoboti', actions: [VIEW] },
  {
    resource: 'users',
    resourceLabel: 'Foydalanuvchilar',
    // Bloklash - hisobni yopish/ochish
    actions: [...FULL, BLOCK],
  },
  {
    resource: 'roles',
    resourceLabel: 'Rollar va huquqlar',
    actions: FULL,
  },

  // Ma'muriyat
  { resource: 'organizations', resourceLabel: 'Tashkilotlar', actions: FULL },
  { resource: 'branches', resourceLabel: 'Filiallar', actions: FULL },
  { resource: 'warehouses', resourceLabel: 'Omborxonalar', actions: FULL },
  { resource: 'cash-registers', resourceLabel: 'Kassalar', actions: FULL },

  // Kontragentlar
  { resource: 'customers', resourceLabel: 'Mijozlar', actions: FULL },
  { resource: 'suppliers', resourceLabel: 'Yetkazib beruvchilar', actions: FULL },

  // Hujjatlar
  { resource: 'inbound-documents', resourceLabel: 'Kirim hujjatlari', actions: [...FULL, { action: 'approve', label: 'Tasdiqlash' }, { action: 'print', label: 'Etiketka chop etish' }] },

  { resource: 'outbound-documents', resourceLabel: 'Chiqim hujjatlari', actions: [...FULL, { action: 'approve', label: 'Tasdiqlash' }] },
  { resource: 'stock', resourceLabel: "Ombor qoldig'i", actions: [VIEW] },
  { resource: 'inventory', resourceLabel: 'Inventarizatsiya', actions: [...FULL, { action: 'scan', label: 'Sanash (skaner)' }] },
  { resource: 'pos', resourceLabel: 'Kassa (POS)', actions: [VIEW, { action: 'sell', label: 'Sotish' }] },
  { resource: 'integrations', resourceLabel: 'Integratsiyalar', actions: [VIEW, UPDATE, { action: 'sync', label: 'Qoldiqni yuborish' }] },

  // Marketing vositalari
  { resource: 'gift-certificates', resourceLabel: "Sovg'a sertifikatlari", actions: [...FULL, { action: 'sell', label: 'Sotish' }] },
  { resource: 'promotions', resourceLabel: 'Aksiyalar', actions: FULL },

  // Buhgalteriya
  { resource: 'currencies', resourceLabel: 'Valyuta turlari', actions: FULL },
  { resource: 'currency-rates', resourceLabel: 'Valyuta kursi', actions: FULL },
  { resource: 'payment-types', resourceLabel: "To'lov turlari", actions: FULL },
  { resource: 'expense-types', resourceLabel: 'Harajat turlari', actions: FULL },
  { resource: 'payments', resourceLabel: "Harajat va pul tushumlari", actions: FULL },
  { resource: 'cash-balance', resourceLabel: "Kassadagi qoldiq", actions: [VIEW] },
  { resource: 'cash-withdrawals', resourceLabel: 'Kassadan olingan pul', actions: [VIEW, CREATE, DELETE] },

  // Materiallar
  { resource: 'materials', resourceLabel: 'Materiallar', actions: FULL },

  // Material ma'lumotlari
  { resource: 'product-categories', resourceLabel: 'Kategoriyalar', actions: FULL },
  { resource: 'product-brands', resourceLabel: 'Brendlar', actions: FULL },
  { resource: 'product-units', resourceLabel: "O'lchov birliklari", actions: FULL },
  { resource: 'colors', resourceLabel: 'Ranglar', actions: FULL },
  { resource: 'sizes', resourceLabel: "O'lchamlar", actions: FULL },
  { resource: 'countries', resourceLabel: 'Davlatlar', actions: FULL },
  { resource: 'regions', resourceLabel: 'Viloyatlar', actions: FULL },
];

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(RoleSeed)
    private readonly roleSeedRepository: Repository<RoleSeed>,
  ) {}

  findAll() {
    return this.permissionRepository.find({ order: { sortOrder: 'ASC' } });
  }

  /** Ro'yxatdagi huquqlarni yaratadi/yangilaydi, ortiqchasini o'chiradi */
  async seed() {
    const desired: Partial<Permission>[] = [];
    let sortOrder = 0;

    for (const group of PERMISSION_GROUPS) {
      for (const { action, label } of group.actions) {
        desired.push({
          name: `${action}:${group.resource}`,
          action,
          resource: group.resource,
          resourceLabel: group.resourceLabel,
          actionLabel: label,
          description: `${group.resourceLabel} - ${label}`,
          sortOrder: sortOrder++,
        });
      }
    }

    for (const item of desired) {
      const existing = await this.permissionRepository.findOne({ where: { name: item.name } });
      if (existing) {
        // Nomi o'zgarmaydi, faqat yorliq/tartib yangilanadi - rollardagi bog'lanish saqlanadi
        await this.permissionRepository.update(existing.id, item);
      } else {
        await this.permissionRepository.save(this.permissionRepository.create(item));
      }
    }

    await this.removeStale(desired.map((p) => p.name));
  }

  /**
   * Doimiy rollar. Bir marta yaratiladi va huquqlari beriladi (yaratilgani
   * system_role_seeds ga yoziladi - admin o'chirsa qayta paydo bo'lmaydi);
   * bor bo'lsa faqat isSystem belgisi tekshiriladi (huquqlarini admin o'zi
   * boshqaradi). Super admin har safar barcha huquqlarni oladi.
   */
  async seedSystemRoles() {
    const all = await this.permissionRepository.find();
    const seeded = new Set((await this.roleSeedRepository.find()).map((s) => s.name));

    const resolve = (grants: string[] | 'ALL'): Permission[] => {
      if (grants === 'ALL') return all;
      const picked = new Map<string, Permission>();
      for (const grant of grants) {
        const [resource, actions] = grant.split(':');
        const wanted = actions ? actions.split(',').map((a) => a.trim()) : null;
        for (const perm of all) {
          if (perm.resource !== resource) continue;
          if (wanted && !wanted.includes(perm.action)) continue;
          picked.set(perm.id, perm);
        }
      }
      return [...picked.values()];
    };

    for (const spec of SYSTEM_ROLES) {
      const role = await this.roleRepository.findOne({
        where: { name: spec.name },
        relations: ['permissions'],
      });

      if (!role) {
        // Avval yaratilgan, keyin admin o'chirgan - qaytarmaymiz (yopiq rol bundan mustasno)
        if (seeded.has(spec.name) && !spec.locked) continue;
        const created = await this.roleRepository.save(
          this.roleRepository.create({
            name: spec.name,
            description: spec.description,
            isSystem: true,
            permissions: resolve(spec.grants),
          }),
        );
        if (!seeded.has(spec.name)) await this.roleSeedRepository.save({ name: spec.name });
        this.logger.log(`Doimiy rol yaratildi: ${spec.name} (${created.permissions.length} ta huquq)`);
        continue;
      }

      // Eskidan bor rol ham belgilanadi - o'chirilsa qayta yaratilmasin
      if (!seeded.has(spec.name)) await this.roleSeedRepository.save({ name: spec.name });
      if (!role.isSystem) await this.roleRepository.update(role.id, { isSystem: true });

      if (spec.locked) {
        // Super admin: hamma huquq, har doim
        const have = new Set((role.permissions || []).map((p) => p.id));
        if (all.some((p) => !have.has(p.id))) {
          role.permissions = all;
          await this.roleRepository.save(role);
        }
      }
    }
  }

  /**
   * Ro'yxatda yo'q eski huquqlarni o'chiradi. Avval rollardan uzamiz -
   * shunda bog'lovchi jadval (role_permissions) tozalanadi; xodimlarning
   * qo'shimcha huquqlari (user_extra_permissions) esa FK CASCADE bilan ketadi.
   */
  private async removeStale(keepNames: string[]) {
    const all = await this.permissionRepository.find();
    const stale = all.filter((p) => !keepNames.includes(p.name));
    if (!stale.length) return;

    const staleIds = new Set(stale.map((p) => p.id));
    const roles = await this.roleRepository.find({ relations: ['permissions'] });

    for (const role of roles) {
      const kept = (role.permissions || []).filter((p) => !staleIds.has(p.id));
      if (kept.length !== (role.permissions || []).length) {
        role.permissions = kept;
        await this.roleRepository.save(role);
      }
    }

    await this.permissionRepository.remove(stale);
    this.logger.log(`Eski huquqlar o'chirildi: ${stale.map((p) => p.name).join(', ')}`);
  }
}
