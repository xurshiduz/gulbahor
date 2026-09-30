import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { Branch } from '../administration/entities/branch.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { PaymentType } from '../accounting/entities/payment-type.entity';
import { roundMoney } from '../references/common/numeric';
import { CashBalanceQueryDto } from './dto/cash.dto';

interface BalanceRow {
  cashRegisterId: string;
  currencyId: string;
  paymentTypeId: string | null;
  opening: number;
  income: number;
  expense: number;
  withdrawn: number;
  closing: number;
}

/**
 * Kassadagi qoldiq.
 *
 * Pul harakatlari: pul tushumi (+), harajat (-), kassadan olingan pul (-).
 * Qoldiq kassa x valyuta x to'lov turi bo'yicha, har biri o'z valyutasida
 * (dollar dollarligicha) hisoblanadi.
 *
 * Sana oralig'i berilsa: boshidagi qoldiq (`from` dan oldingi hammasi),
 * oraliqdagi tushum / harajat / olingan pul va oxiridagi qoldiq (`to`
 * kuni oxiriga). Oraliq berilmasa - hozirgi holat.
 */
@Injectable()
export class CashBalanceService {
  constructor(
    @InjectRepository(CashRegister) private readonly registerRepo: Repository<CashRegister>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Currency) private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(PaymentType) private readonly paymentTypeRepo: Repository<PaymentType>,
    private readonly dataSource: DataSource,
  ) {}

  /** Harakatlar yig'indisi. registerIds null - hamma kassa */
  private async movements(registerIds: string[] | null, from: string | null, to: string | null): Promise<BalanceRow[]> {
    const rows: BalanceRow[] = await this.dataSource.query(
      `WITH moves AS (
         SELECT p."cashRegisterId", p."currencyId", p."paymentTypeId", p."paymentDate" AS day,
                CASE WHEN p.direction = 'INCOME' THEN p.amount ELSE 0 END  AS income,
                CASE WHEN p.direction = 'EXPENSE' THEN p.amount ELSE 0 END AS expense,
                0::numeric                                                AS withdrawn
           FROM payments p
          WHERE p."cashRegisterId" IS NOT NULL
         UNION ALL
         SELECT w."cashRegisterId", w."currencyId", w."paymentTypeId", w."withdrawnAt"::date, 0, 0, w.amount
           FROM cash_withdrawals w
       )
       SELECT "cashRegisterId", "currencyId", "paymentTypeId",
              SUM(CASE WHEN $1::date IS NOT NULL AND day < $1::date THEN income - expense - withdrawn ELSE 0 END)::float8 AS opening,
              SUM(CASE WHEN ($1::date IS NULL OR day >= $1::date) AND ($2::date IS NULL OR day <= $2::date) THEN income ELSE 0 END)::float8 AS income,
              SUM(CASE WHEN ($1::date IS NULL OR day >= $1::date) AND ($2::date IS NULL OR day <= $2::date) THEN expense ELSE 0 END)::float8 AS expense,
              SUM(CASE WHEN ($1::date IS NULL OR day >= $1::date) AND ($2::date IS NULL OR day <= $2::date) THEN withdrawn ELSE 0 END)::float8 AS withdrawn,
              SUM(CASE WHEN $2::date IS NULL OR day <= $2::date THEN income - expense - withdrawn ELSE 0 END)::float8 AS closing
         FROM moves
        WHERE ($3::uuid[] IS NULL OR "cashRegisterId" = ANY ($3))
        GROUP BY 1, 2, 3`,
      [from, to, registerIds],
    );
    return rows;
  }

  /** Bitta kassa, valyuta va to'lov turi bo'yicha hozirgi qoldiq - puli olinayotganda tekshiriladi */
  async current(cashRegisterId: string, currencyId: string, paymentTypeId: string | null) {
    const rows = await this.movements([cashRegisterId], null, null);
    const row = rows.find((item) => item.currencyId === currencyId && (item.paymentTypeId || null) === (paymentTypeId || null));
    return roundMoney(row?.closing || 0);
  }

  /** Kassa bo'yicha hozirgi qoldiqlar - forma uchun (kassadan pul olishda nima borligi ko'rinadi) */
  async currentByRegister(cashRegisterId: string) {
    const [rows, currencies, paymentTypes] = await Promise.all([
      this.movements([cashRegisterId], null, null),
      this.currencyRepo.find(),
      this.paymentTypeRepo.find(),
    ]);
    const currency = new Map(currencies.map((row) => [row.id, row]));
    const paymentType = new Map(paymentTypes.map((row) => [row.id, row]));
    return rows
      .filter((row) => Math.abs(row.closing) > 0.004)
      .map((row) => ({
        currencyId: row.currencyId,
        currencyCode: currency.get(row.currencyId)?.code || null,
        paymentTypeId: row.paymentTypeId,
        paymentTypeName: row.paymentTypeId ? paymentType.get(row.paymentTypeId)?.name || null : null,
        balance: roundMoney(row.closing),
      }));
  }

  async report(query: CashBalanceQueryDto) {
    const from = query.from || null;
    const to = query.to || null;
    if (from && to && from > to) throw new BadRequestException('"Sanadan" "sanagacha"dan keyin bo`lmasligi kerak');

    // Qaysi kassalar: bitta kassa, filialning kassalari yoki hammasi
    let registerIds: string[] | null = null;
    if (query.cashRegisterId) {
      const register = await this.registerRepo.findOne({ where: { id: query.cashRegisterId } });
      if (!register) throw new NotFoundException('Kassa topilmadi');
      if (query.branchId && register.branchId !== query.branchId) throw new BadRequestException('Kassa bu filialga tegishli emas');
      registerIds = [register.id];
    } else if (query.branchId) {
      if (!(await this.branchRepo.findOne({ where: { id: query.branchId } }))) throw new NotFoundException('Filial topilmadi');
      registerIds = (await this.registerRepo.find({ where: { branchId: query.branchId }, select: { id: true } })).map((row) => row.id);
    }

    const [rows, registers, currencies, paymentTypes] = await Promise.all([
      registerIds && !registerIds.length ? Promise.resolve([] as BalanceRow[]) : this.movements(registerIds, from, to),
      this.registerRepo.find({ relations: { branch: true } }),
      this.currencyRepo.find(),
      this.paymentTypeRepo.find(),
    ]);
    const register = new Map(registers.map((row) => [row.id, row]));
    const currency = new Map(currencies.map((row) => [row.id, row]));
    const paymentType = new Map(paymentTypes.map((row) => [row.id, row]));

    const lines = rows
      // Oraliqda harakati ham, qoldig'i ham yo'q qatorlar kerak emas
      .filter((row) => [row.opening, row.income, row.expense, row.withdrawn, row.closing].some((value) => Math.abs(value) > 0.004))
      .map((row) => {
        const cashRegister = register.get(row.cashRegisterId);
        const money = currency.get(row.currencyId);
        return {
          cashRegisterId: row.cashRegisterId,
          cashRegisterName: cashRegister?.name || null,
          branchId: cashRegister?.branchId || null,
          branchName: cashRegister?.branch?.name || null,
          currencyId: row.currencyId,
          currencyCode: money?.code || null,
          isBase: !!money?.isBase,
          paymentTypeId: row.paymentTypeId,
          paymentTypeName: row.paymentTypeId ? paymentType.get(row.paymentTypeId)?.name || null : null,
          opening: roundMoney(row.opening),
          income: roundMoney(row.income),
          expense: roundMoney(row.expense),
          withdrawn: roundMoney(row.withdrawn),
          closing: roundMoney(row.closing),
        };
      })
      .sort((a, b) =>
        (a.branchName || '').localeCompare(b.branchName || '') ||
        (a.cashRegisterName || '').localeCompare(b.cashRegisterName || '') ||
        Number(b.isBase) - Number(a.isBase) ||
        (a.currencyCode || '').localeCompare(b.currencyCode || '') ||
        (a.paymentTypeName || '').localeCompare(b.paymentTypeName || ''));

    // Valyuta bo'yicha jami - har xil valyutani qo'shib bo'lmaydi
    const totals = new Map<string, { currencyId: string; currencyCode: string | null; isBase: boolean; opening: number; income: number; expense: number; withdrawn: number; closing: number }>();
    for (const line of lines) {
      const total = totals.get(line.currencyId) || {
        currencyId: line.currencyId, currencyCode: line.currencyCode, isBase: line.isBase, opening: 0, income: 0, expense: 0, withdrawn: 0, closing: 0,
      };
      total.opening += line.opening;
      total.income += line.income;
      total.expense += line.expense;
      total.withdrawn += line.withdrawn;
      total.closing += line.closing;
      totals.set(line.currencyId, total);
    }

    return {
      from,
      to,
      rows: lines,
      totals: [...totals.values()]
        .map((total) => ({
          ...total,
          opening: roundMoney(total.opening), income: roundMoney(total.income), expense: roundMoney(total.expense),
          withdrawn: roundMoney(total.withdrawn), closing: roundMoney(total.closing),
        }))
        .sort((a, b) => Number(b.isBase) - Number(a.isBase) || (a.currencyCode || '').localeCompare(b.currencyCode || '')),
    };
  }
}
