import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { ProductCategory } from '../references/entities/product-category.entity';
import { Material } from '../materials/entities/material.entity';
import { User } from '../users/entities/user.entity';
import { roundMoney } from '../references/common/numeric';
import { today } from '../accounting/services/currencies.service';

export type GroupBy = 'branch' | 'warehouse' | 'category' | 'material' | 'day' | 'cashier';
export const GROUPS: GroupBy[] = ['branch', 'warehouse', 'category', 'material', 'day', 'cashier'];

export interface ReportFilter {
  from: string;
  to: string;
  branchId?: string | null;
  warehouseId?: string | null;
  categoryId?: string | null;
  materialId?: string | null;
  cashierId?: string | null;
}

interface RawRow {
  key: string | null;
  revenue: number; returns: number; qty: number; returnedQty: number; checks: number; cost: number; returnedCost: number;
}

const GROUP_SQL: Record<GroupBy, string> = {
  branch: 'l."branchId"', warehouse: 'l."warehouseId"', category: 'l."categoryId"',
  material: 'l."materialId"', day: 'l.day::text', cashier: 'l."userId"',
};

/**
 * Rahbar hisoboti: savdo, qaytarish, tannarx, foyda, harajat.
 *
 * Savdo - tasdiqlangan chiqim hujjatlari (hujjat sanasi bo'yicha);
 * qaytarish - tasdiqlangan qaytarish / almashinuv kirimlari. Tannarx -
 * tovarning o'rtacha xarid narxi (faqat xarid hujjatlaridan, valyuta
 * hujjat sanasidagi kurs bilan so'mga o'girilgan). Harajatlar - kassalar
 * orqali filialga bog'lanadi.
 *
 * Bitta so'rov istalgan kesimda guruhlaydi: filial -> ombor -> kategoriya
 * -> tovar, shuningdek kunlar va kassirlar bo'yicha; filtrlar ichma-ich
 * kirish uchun.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(ProductCategory) private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /** Savdo va qaytarish qatorlari (tannarx bilan) - guruhlab */
  private async aggregate(filter: ReportFilter, groupBy: GroupBy | null): Promise<RawRow[]> {
    const key = groupBy ? GROUP_SQL[groupBy] : 'NULL';
    return this.dataSource.query(
      `WITH cost AS (
         SELECT item."materialId",
                SUM(item.quantity * item.price * COALESCE(onDate.rate, oldest.rate, 1)) / NULLIF(SUM(item.quantity), 0) AS avg_cost
           FROM inbound_document_items item
           JOIN inbound_documents doc ON doc.id = item."documentId"
           LEFT JOIN LATERAL (SELECT rate FROM currency_rates WHERE "currencyId" = doc."currencyId" AND date <= doc."documentDate" ORDER BY date DESC LIMIT 1) onDate ON TRUE
           LEFT JOIN LATERAL (SELECT rate FROM currency_rates WHERE "currencyId" = doc."currencyId" ORDER BY date ASC LIMIT 1) oldest ON TRUE
          WHERE doc.status = 'APPROVED' AND doc.type = 'PURCHASE'
          GROUP BY 1
       ), lines AS (
         SELECT 'SALE' AS kind, doc.id AS "docId", doc."documentDate" AS day, doc."warehouseId", w."branchId", doc."createdById" AS "userId",
                m."categoryId", item."materialId", item.quantity AS qty, item.quantity * item.price AS amount
           FROM outbound_document_items item
           JOIN outbound_documents doc ON doc.id = item."documentId"
           JOIN warehouses w ON w.id = doc."warehouseId"
           JOIN materials m ON m.id = item."materialId"
          WHERE doc.status = 'APPROVED' AND doc."documentDate" BETWEEN $1::date AND $2::date
         UNION ALL
         SELECT 'RETURN', doc.id, doc."documentDate", doc."warehouseId", w."branchId", doc."createdById",
                m."categoryId", item."materialId", item.quantity, item.quantity * item.price
           FROM inbound_document_items item
           JOIN inbound_documents doc ON doc.id = item."documentId"
           JOIN warehouses w ON w.id = doc."warehouseId"
           JOIN materials m ON m.id = item."materialId"
          WHERE doc.status = 'APPROVED' AND doc.type IN ('RETURN', 'EXCHANGE') AND doc."documentDate" BETWEEN $1::date AND $2::date
       )
       SELECT ${key} AS key,
              COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'SALE'), 0)::float8 AS revenue,
              COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'RETURN'), 0)::float8 AS returns,
              COALESCE(SUM(l.qty) FILTER (WHERE l.kind = 'SALE'), 0)::float8 AS qty,
              COALESCE(SUM(l.qty) FILTER (WHERE l.kind = 'RETURN'), 0)::float8 AS "returnedQty",
              COUNT(DISTINCT l."docId") FILTER (WHERE l.kind = 'SALE')::int AS checks,
              COALESCE(SUM(l.qty * COALESCE(c.avg_cost, 0)) FILTER (WHERE l.kind = 'SALE'), 0)::float8 AS cost,
              COALESCE(SUM(l.qty * COALESCE(c.avg_cost, 0)) FILTER (WHERE l.kind = 'RETURN'), 0)::float8 AS "returnedCost"
         FROM lines l
         LEFT JOIN cost c ON c."materialId" = l."materialId"
        WHERE ($3::uuid IS NULL OR l."branchId" = $3)
          AND ($4::uuid IS NULL OR l."warehouseId" = $4)
          AND ($5::uuid IS NULL OR l."categoryId" = $5)
          AND ($6::uuid IS NULL OR l."materialId" = $6)
          AND ($7::uuid IS NULL OR l."userId" = $7)
        ${groupBy ? 'GROUP BY 1' : ''}`,
      [filter.from, filter.to, filter.branchId || null, filter.warehouseId || null, filter.categoryId || null, filter.materialId || null, filter.cashierId || null],
    );
  }

  /** Harajat va pul tushumi (so'mda) - kassa filiali bo'yicha. Ombor/kategoriya darajasida bog'lanmaydi */
  private async money(filter: ReportFilter) {
    const rows: { branchId: string; direction: string; amount: number }[] = await this.dataSource.query(
      `SELECT r."branchId", p.direction, SUM(p."amountUzs")::float8 AS amount
         FROM payments p JOIN cash_registers r ON r.id = p."cashRegisterId"
        WHERE p."paymentDate" BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR r."branchId" = $3)
        GROUP BY 1, 2`,
      [filter.from, filter.to, filter.branchId || null],
    );
    const byBranch = new Map<string, { expenses: number; income: number }>();
    for (const row of rows) {
      const entry = byBranch.get(row.branchId) || { expenses: 0, income: 0 };
      if (row.direction === 'EXPENSE') entry.expenses += Number(row.amount); else entry.income += Number(row.amount);
      byBranch.set(row.branchId, entry);
    }
    return byBranch;
  }

  /** Xom yig'indidan ko'rsatkichlar */
  private metrics(row: RawRow, extra?: { expenses: number; income: number } | null) {
    const revenue = roundMoney(row.revenue);
    const returns = roundMoney(row.returns);
    const netRevenue = roundMoney(revenue - returns);
    const cost = roundMoney(row.cost - row.returnedCost);
    const grossProfit = roundMoney(netRevenue - cost);
    const expenses = extra ? roundMoney(extra.expenses) : null;
    return {
      revenue, returns, netRevenue,
      qty: Number((row.qty - row.returnedQty).toFixed(3)),
      checks: row.checks,
      avgCheck: row.checks ? roundMoney(revenue / row.checks) : 0,
      cost, grossProfit,
      /** Yalpi foyda marjasi: foyda / sof savdo */
      margin: netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : null,
      expenses,
      netProfit: expenses !== null ? roundMoney(grossProfit - expenses) : null,
      income: extra ? roundMoney(extra.income) : null,
    };
  }

  /** Guruh kalitlariga nom: filial, ombor, kategoriya, tovar, kassir */
  private async names(groupBy: GroupBy, keys: string[]) {
    const ids = keys.filter(Boolean);
    const map = new Map<string, { name: any; extra?: any }>();
    if (!ids.length || groupBy === 'day') return map;
    if (groupBy === 'branch') for (const row of await this.branchRepo.findBy({ id: In(ids) })) map.set(row.id, { name: row.name });
    if (groupBy === 'warehouse') for (const row of await this.warehouseRepo.find({ where: { id: In(ids) }, relations: { branch: true } })) map.set(row.id, { name: row.name, extra: row.branch?.name || null });
    // Bir xil nomli ost kategoriyalar farqlansin: ota kategoriya ham beriladi
    if (groupBy === 'category') for (const row of await this.categoryRepo.find({ where: { id: In(ids) }, relations: { parent: true } })) map.set(row.id, { name: row.name, extra: row.parent?.name || null });
    if (groupBy === 'material') {
      for (const row of await this.materialRepo.find({ where: { id: In(ids) }, relations: { size: true, color: true, images: true } })) {
        const image = row.images?.find((item) => item.isMain) || row.images?.[0];
        map.set(row.id, { name: row.name, extra: { sku: row.sku, size: row.size?.name || null, color: row.color?.name || null, imageUrl: image?.url || null } });
      }
    }
    if (groupBy === 'cashier') for (const row of await this.userRepo.findBy({ id: In(ids) })) map.set(row.id, { name: row.name });
    return map;
  }

  private totals(raw: RawRow | undefined, money: Map<string, { expenses: number; income: number }>, filter: ReportFilter) {
    const base: RawRow = raw || { key: null, revenue: 0, returns: 0, qty: 0, returnedQty: 0, checks: 0, cost: 0, returnedCost: 0 };
    // Harajat faqat kompaniya va filial darajasida ma'noli (ombor/kategoriyaga bo'linmaydi)
    const moneyScope = !filter.warehouseId && !filter.categoryId && !filter.materialId && !filter.cashierId;
    let expenses = 0, income = 0;
    for (const entry of money.values()) { expenses += entry.expenses; income += entry.income; }
    return this.metrics(base, moneyScope ? { expenses, income } : null);
  }

  /** Oldingi xuddi shunday uzunlikdagi davr - o'sish foizi uchun */
  private previousPeriod(from: string, to: string) {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
    return { from: prevStart.toISOString().slice(0, 10), to: prevEnd.toISOString().slice(0, 10) };
  }

  async executive(query: ReportFilter & { groupBy?: string }) {
    const to = query.to || today();
    const from = query.from || `${to.slice(0, 8)}01`;
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new BadRequestException('Sana notog`ri');
    if (from > to) throw new BadRequestException('"Sanadan" "sanagacha"dan keyin bo`lmasligi kerak');
    const filter: ReportFilter = { ...query, from, to };
    const groupBy = (GROUPS.includes(query.groupBy as GroupBy) ? query.groupBy : 'branch') as GroupBy;
    const previous = this.previousPeriod(from, to);

    const [totalRaw, prevRaw, grouped, trend, money, prevMoney] = await Promise.all([
      this.aggregate(filter, null),
      this.aggregate({ ...filter, ...previous }, null),
      this.aggregate(filter, groupBy),
      this.aggregate(filter, 'day'),
      this.money(filter),
      this.money({ ...filter, ...previous }),
    ]);

    const names = await this.names(groupBy, grouped.map((row) => row.key as string));
    const rows = grouped
      .map((row) => {
        const named = row.key ? names.get(row.key) : null;
        return {
          key: row.key,
          name: groupBy === 'day' ? row.key : named?.name ?? null,
          extra: named?.extra ?? null,
          ...this.metrics(row, groupBy === 'branch' && row.key ? money.get(row.key) || { expenses: 0, income: 0 } : null),
        };
      })
      .sort((a, b) => (groupBy === 'day' ? String(a.key).localeCompare(String(b.key)) : b.netRevenue - a.netRevenue));

    // Filial kesimida: savdosi yo'q, lekin harajati bor filial ham ko'rinsin
    if (groupBy === 'branch') {
      const missing = [...money.keys()].filter((branchId) => !rows.some((row) => row.key === branchId));
      if (missing.length) {
        const branches = await this.branchRepo.findBy({ id: In(missing) });
        for (const branch of branches) {
          rows.push({ key: branch.id, name: branch.name, extra: null, ...this.metrics({ key: branch.id, revenue: 0, returns: 0, qty: 0, returnedQty: 0, checks: 0, cost: 0, returnedCost: 0 }, money.get(branch.id)) });
        }
      }
    }

    return {
      period: { from, to, previous },
      groupBy,
      totals: this.totals(totalRaw[0], money, filter),
      previousTotals: this.totals(prevRaw[0], prevMoney, filter),
      rows,
      trend: trend
        .map((row) => ({ day: row.key, revenue: roundMoney(row.revenue - row.returns), profit: roundMoney(row.revenue - row.returns - (row.cost - row.returnedCost)), checks: row.checks }))
        .sort((a, b) => String(a.day).localeCompare(String(b.day))),
      scope: await this.scopeNames(filter),
    };
  }

  /** Breadcrumb uchun: filtrdagi filial / ombor / kategoriya / tovar / kassir nomlari */
  private async scopeNames(filter: ReportFilter) {
    const [branch, warehouse, category, material, cashier] = await Promise.all([
      filter.branchId ? this.branchRepo.findOne({ where: { id: filter.branchId } }) : null,
      filter.warehouseId ? this.warehouseRepo.findOne({ where: { id: filter.warehouseId } }) : null,
      filter.categoryId ? this.categoryRepo.findOne({ where: { id: filter.categoryId } }) : null,
      filter.materialId ? this.materialRepo.findOne({ where: { id: filter.materialId } }) : null,
      filter.cashierId ? this.userRepo.findOne({ where: { id: filter.cashierId } }) : null,
    ]);
    return {
      branch: branch ? { id: branch.id, name: branch.name } : null,
      warehouse: warehouse ? { id: warehouse.id, name: warehouse.name } : null,
      category: category ? { id: category.id, name: category.name } : null,
      material: material ? { id: material.id, name: material.name } : null,
      cashier: cashier ? { id: cashier.id, name: cashier.name } : null,
    };
  }
}
