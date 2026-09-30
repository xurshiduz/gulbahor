import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashWithdrawal } from './entities/cash-withdrawal.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { PaymentType } from '../accounting/entities/payment-type.entity';
import { User } from '../users/entities/user.entity';
import { roundMoney } from '../references/common/numeric';
import { CashBalanceService } from './cash-balance.service';
import { CashRegistersService } from './cash-registers.service';
import { CreateCashWithdrawalDto } from './dto/cash.dto';

const RELATIONS = { cashRegister: { branch: true }, currency: true, paymentType: true, fromUser: true, takenBy: true, createdBy: true } as const;
const person = (user?: User | null) => (user ? { id: user.id, name: user.name } : null);

/**
 * Kassadan olingan pul. Olinadigan summa kassadagi shu valyuta va to'lov
 * turidagi qoldiqdan oshmaydi; qolgani kassada qoladi.
 */
@Injectable()
export class CashWithdrawalsService {
  constructor(
    @InjectRepository(CashWithdrawal) private readonly repo: Repository<CashWithdrawal>,
    @InjectRepository(Currency) private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(PaymentType) private readonly paymentTypeRepo: Repository<PaymentType>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly balances: CashBalanceService,
    private readonly registers: CashRegistersService,
  ) {}

  private view(row: CashWithdrawal) {
    const { cashRegister, currency, paymentType, fromUser, takenBy, createdBy, ...rest } = row;
    return {
      ...rest,
      cashRegister: cashRegister ? { id: cashRegister.id, name: cashRegister.name, branchName: cashRegister.branch?.name || null } : null,
      currency: currency ? { id: currency.id, code: currency.code, isBase: currency.isBase } : null,
      paymentType: paymentType ? { id: paymentType.id, name: paymentType.name } : null,
      fromUser: person(fromUser),
      takenBy: person(takenBy),
      createdBy: person(createdBy),
    };
  }

  async findAll() {
    const rows = await this.repo.find({ relations: RELATIONS, order: { withdrawnAt: 'DESC' } });
    return rows.map((row) => this.view(row));
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id }, relations: RELATIONS });
    if (!row) throw new NotFoundException('Yozuv topilmadi');
    return this.view(row);
  }

  async create(dto: CreateCashWithdrawalDto, userId?: string) {
    const register = await this.registers.findOne(dto.cashRegisterId);
    const currency = await this.currencyRepo.findOne({ where: { id: dto.currencyId } });
    if (!currency) throw new NotFoundException('Valyuta topilmadi');

    let paymentTypeId: string | null = null;
    if (dto.paymentTypeId) {
      const paymentType = await this.paymentTypeRepo.findOne({ where: { id: dto.paymentTypeId } });
      if (!paymentType) throw new NotFoundException('To`lov turi topilmadi');
      paymentTypeId = paymentType.id;
    }

    for (const [id, label] of [[dto.fromUserId, 'Kassir'], [dto.takenById, 'Olib ketgan xodim']] as const) {
      if (id && !(await this.userRepo.findOne({ where: { id } }))) throw new NotFoundException(`${label} topilmadi`);
    }

    // Kassada bor puldan ortiq olib bo'lmaydi
    const balanceBefore = await this.balances.current(register.id, currency.id, paymentTypeId);
    if (dto.amount > balanceBefore + 0.004) {
      throw new BadRequestException(`Kassada ${balanceBefore.toLocaleString('ru-RU')} ${currency.code} bor - undan ko'p olib bo'lmaydi`);
    }

    const withdrawnAt = dto.withdrawnAt ? new Date(dto.withdrawnAt.replace(' ', 'T')) : new Date();
    if (Number.isNaN(withdrawnAt.getTime())) throw new BadRequestException('Vaqt notog`ri');

    const saved = await this.repo.save(this.repo.create({
      withdrawnAt,
      cashRegisterId: register.id,
      currencyId: currency.id,
      paymentTypeId,
      amount: dto.amount,
      balanceBefore,
      balanceAfter: roundMoney(balanceBefore - dto.amount),
      fromUserId: dto.fromUserId || null,
      takenById: dto.takenById || userId || null,
      description: String(dto.description || '').trim() || null,
      createdById: userId || null,
    }));
    return this.findOne(saved.id);
  }

  /** Xato kiritilgan yozuvni o'chirish - pul kassaga qaytgan hisoblanadi */
  async remove(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Yozuv topilmadi');
    await this.repo.remove(row);
    return { success: true };
  }

  /** Forma tanlovlari: kassalar (kassirlari bilan), valyutalar, to'lov turlari, xodimlar */
  async options(user: any) {
    const [registers, currencies, paymentTypes, users] = await Promise.all([
      this.registers.findAll(),
      this.currencyRepo.find({ order: { isBase: 'DESC', code: 'ASC' } }),
      this.paymentTypeRepo.find({ order: { name: 'ASC' } }),
      this.userRepo.find({ where: { isActive: true }, order: { name: 'ASC' } }),
    ]);
    return {
      cashRegisters: registers.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId, branchName: row.branch?.name || null, isActive: row.isActive, userIds: row.users.map((cashier) => cashier.id) })),
      currencies: currencies.map((row) => ({ id: row.id, code: row.code, name: row.name, isBase: row.isBase, isActive: row.isActive })),
      paymentTypes: paymentTypes.map((row) => ({ id: row.id, name: row.name, isActive: row.isActive })),
      users: users.map((row) => ({ id: row.id, name: row.name })),
      currentUserId: user?.id || null,
    };
  }
}
