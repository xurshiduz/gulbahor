import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { SUPER_ADMIN } from './system-roles';
import { ADMIN_ROLE_PATTERN, userIsSuperAdmin } from '../auth/permissions.util';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async findAll() {
    return this.roleRepository.find({
      relations: ['permissions'],
      order: { isSystem: 'DESC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: ['permissions'],
    });
    if (!role) throw new NotFoundException('Rol topilmadi');
    return role;
  }

  /**
   * Admin huquqi rol NOMI bo'yicha aniqlanadi (permissions.util). Shuning
   * uchun "admin", "administrator", "superadmin" kabi nomli yangi rol
   * yaratib bo'lmaydi - aks holda u o'z-o'zidan to'liq huquqli bo'lib qolardi.
   */
  private assertNameAllowed(name: string) {
    if (ADMIN_ROLE_PATTERN.test(name)) {
      throw new BadRequestException(`"${name}" nomi tizim rollari uchun band - boshqa nom tanlang`);
    }
  }

  private async assertNameFree(name: string, excludeId?: string) {
    const existing = await this.roleRepository
      .createQueryBuilder('role')
      .where('LOWER(role.name) = :name', { name: name.toLowerCase() })
      .getOne();
    if (existing && existing.id !== excludeId) throw new ConflictException('Bunday nomli rol allaqachon mavjud');
  }

  async create(dto: CreateRoleDto) {
    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('Rol nomi kiritilishi shart');
    this.assertNameAllowed(name);
    await this.assertNameFree(name);

    const role = this.roleRepository.create({ name, description: dto.description });
    if (dto.permissionIds?.length) {
      role.permissions = await this.permissionRepository.findBy({ id: In(dto.permissionIds) });
    }
    return this.roleRepository.save(role);
  }

  async update(id: string, dto: CreateRoleDto, actor?: any) {
    const role = await this.findOne(id);
    const name = String(dto.name || '').trim();

    if (role.name === SUPER_ADMIN) {
      throw new BadRequestException('Super admin roli yopiq - o`zgartirib bo`lmaydi');
    }
    // Admin roli - faqat Super admin o'zgartiradi
    if (ADMIN_ROLE_PATTERN.test(role.name) && actor && !userIsSuperAdmin(actor)) {
      throw new ForbiddenException('Admin rolini faqat Super admin o`zgartiradi');
    }

    if (name && name !== role.name) {
      // Doimiy rolning nomi o'zgarmaydi - kod unga nomi bilan tayanadi
      if (role.isSystem) throw new BadRequestException('Doimiy rolning nomini o`zgartirib bo`lmaydi');
      this.assertNameAllowed(name);
      await this.assertNameFree(name, id);
      role.name = name;
    }
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissionIds) {
      role.permissions = dto.permissionIds.length
        ? await this.permissionRepository.findBy({ id: In(dto.permissionIds) })
        : [];
    }
    return this.roleRepository.save(role);
  }

  /**
   * Super admindan boshqa har qanday rol o'chiriladi - doimiylar ham;
   * o'chirilgani keyingi ishga tushishda qayta yaratilmaydi. Faqat
   * foydalanuvchilarga biriktirilgan rol o'chirilmaydi - avval ularni
   * boshqa rolga o'tkazish kerak, aks holda odamlar huquqsiz qolardi.
   */
  async remove(id: string, actor?: any) {
    const role = await this.roleRepository.findOne({ where: { id }, relations: ['users'] });
    if (!role) throw new NotFoundException('Rol topilmadi');
    if (role.name === SUPER_ADMIN) {
      throw new BadRequestException('Super admin rolini o`chirib bo`lmaydi');
    }
    if (ADMIN_ROLE_PATTERN.test(role.name) && actor && !userIsSuperAdmin(actor)) {
      throw new ForbiddenException('Admin rolini faqat Super admin o`chiradi');
    }
    const holders = role.users || [];
    if (holders.length) {
      const names = holders.slice(0, 5).map((u) => u.name || u.username).join(', ');
      throw new BadRequestException(
        `Bu rol ${holders.length} ta foydalanuvchiga biriktirilgan (${names}${holders.length > 5 ? ', ...' : ''}). Avval ularga boshqa rol bering.`,
      );
    }
    await this.roleRepository.remove(role);
    return { success: true };
  }
}
