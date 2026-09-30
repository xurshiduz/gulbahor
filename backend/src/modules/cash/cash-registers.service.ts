import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { User } from '../users/entities/user.entity';
import { userIsAdmin } from '../auth/permissions.util';
import { CreateCashRegisterDto, UpdateCashRegisterDto } from './dto/cash.dto';

/** Foydalanuvchidan faqat id va ism - parol xeshi kabi maydonlar chiqmasin */
const publicUser = (user: User) => ({ id: user.id, name: user.name, username: user.username });

@Injectable()
export class CashRegistersService {
  constructor(
    @InjectRepository(CashRegister) private readonly repo: Repository<CashRegister>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  private view(register: CashRegister) {
    return {
      ...register,
      branch: register.branch ? { id: register.branch.id, name: register.branch.name } : null,
      warehouse: register.warehouse ? { id: register.warehouse.id, name: register.warehouse.name } : null,
      users: (register.users || []).map(publicUser),
    };
  }

  async findAll() {
    const registers = await this.repo.find({
      relations: { branch: true, warehouse: true, users: true },
      order: { name: 'ASC' },
    });
    return registers.map((register) => this.view(register));
  }

  async findOne(id: string) {
    const register = await this.repo.findOne({ where: { id }, relations: { branch: true, warehouse: true, users: true } });
    if (!register) throw new NotFoundException('Kassa topilmadi');
    return this.view(register);
  }

  /** Xodimga ochiq kassalar: administrator - hammasi; boshqalar - kassiri bo'lgani yoki kassiri belgilanmagani */
  async availableFor(user: any, activeOnly = true) {
    const registers = await this.findAll();
    return registers.filter((register) =>
      (!activeOnly || register.isActive) &&
      (userIsAdmin(user) || !register.users.length || register.users.some((cashier) => cashier.id === user?.id)));
  }

  /** Xodim shu kassada ishlay oladimi - kassa (sotuv, tushum) uchun tekshiruv */
  async assertAccess(cashRegisterId: string, user: any) {
    const register = await this.findOne(cashRegisterId);
    if (!register.isActive) throw new BadRequestException(`"${register.name}" kassasi yopilgan`);
    if (!userIsAdmin(user) && register.users.length && !register.users.some((cashier) => cashier.id === user?.id)) {
      throw new ForbiddenException(`Siz "${register.name}" kassasida ishlay olmaysiz`);
    }
    return register;
  }

  async create(dto: CreateCashRegisterDto) {
    const register = await this.repo.save(this.repo.create(await this.prepare(dto)));
    return this.findOne(register.id);
  }

  async update(id: string, dto: UpdateCashRegisterDto) {
    const existing = await this.repo.findOne({ where: { id }, relations: { users: true } });
    if (!existing) throw new NotFoundException('Kassa topilmadi');
    // ManyToMany bog'lanish uchun save kerak (update uni saqlamaydi)
    await this.repo.save({ ...existing, ...(await this.prepare(dto, existing)) });
    return this.findOne(id);
  }

  async remove(id: string) {
    const register = await this.repo.findOne({ where: { id } });
    if (!register) throw new NotFoundException('Kassa topilmadi');
    try {
      await this.repo.remove(register);
    } catch (error: any) {
      if (error?.code === '23503' || error?.driverError?.code === '23503') {
        throw new BadRequestException('Kassada pul harakati bor - uni o`chirib bo`lmaydi, faol emas qilib qo`ying');
      }
      throw error;
    }
    return { success: true };
  }

  private async prepare(dto: UpdateCashRegisterDto, existing?: CashRegister): Promise<Partial<CashRegister>> {
    const data: Partial<CashRegister> = {};
    const branchId = dto.branchId || existing?.branchId;

    if (dto.name !== undefined) {
      data.name = String(dto.name || '').trim();
      if (!data.name) throw new BadRequestException('Kassa nomi kiritilishi shart');
    }
    if (dto.branchId) {
      if (!(await this.branchRepo.findOne({ where: { id: dto.branchId } }))) throw new NotFoundException('Filial topilmadi');
      data.branchId = dto.branchId;
    }
    if (!branchId) throw new BadRequestException('Filial tanlanishi shart');

    if (dto.warehouseId !== undefined) {
      if (dto.warehouseId) {
        const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId } });
        if (!warehouse) throw new NotFoundException('Omborxona topilmadi');
        if (warehouse.branchId !== branchId) throw new BadRequestException('Omborxona kassa filialiga tegishli emas');
      }
      data.warehouseId = dto.warehouseId || null;
    } else if (dto.branchId && existing?.warehouseId && dto.branchId !== existing.branchId) {
      // Filial o'zgarsa - eski filialning ombori qolib ketmasin
      data.warehouseId = null;
    }

    if (dto.userIds !== undefined) {
      const ids = [...new Set(dto.userIds || [])];
      const users = ids.length ? await this.userRepo.findBy({ id: In(ids) }) : [];
      if (users.length !== ids.length) throw new NotFoundException('Tanlangan kassirlardan biri topilmadi');
      data.users = users;
    }
    if (dto.description !== undefined) data.description = String(dto.description || '').trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    // Bitta filialda bir xil nomli ikkita kassa bo'lmasin
    const name = data.name ?? existing?.name;
    const taken = await this.repo.findOne({
      where: existing ? { branchId, name, id: Not(existing.id) } : { branchId, name },
    });
    if (taken) throw new ConflictException(`Bu filialda "${name}" nomli kassa bor`);
    return data;
  }
}
