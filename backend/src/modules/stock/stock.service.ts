import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { roundMoney } from '../references/common/numeric';

/**
 * Ombordagi qoldiq.
 *
 * Alohida qoldiq jadvali yo'q - qoldiq tasdiqlangan hujjatlardan
 * hisoblanadi: kirim (xarid, qaytarish, almashinuv) qo'shadi, chiqim
 * (sotuv) ayiradi. Qoralama hujjatlar hisobga olinmaydi.
 *
 * Kirim summasi so'mda: valyutadagi xarid hujjat sanasidagi kurs bo'yicha
 * (o'sha sanagacha kiritilgan oxirgisi, bo'lmasa - eng eskisi) o'giriladi.
 * Sotuv narxi - tovar kartochkasidagi sotuv narxi; kiritilmagan bo'lsa
 * oxirgi sotilgan narxi.
 */

interface Movement {
  materialId: string;
  warehouseId: string | null;
  qty: number;
  amount: number;
}

export interface StockScope {
  branchId?: string;
  warehouseId?: string;
}

/** Bitta tovarning qoldig'i va qiymati */
export interface StockRow {
  materialId: string;
  material: Record<string, any> | null;
  inQuantity: number;
  outQuantity: number;
  quantity: number;
  /** O'rtacha kirim narxi */
  avgCost: number;
  costAmount: number;
  salePrice: number;
  saleAmount: number;
  profit: number;
  /** Sotuv narxi ma'lummi (tovar avval sotilganmi) */
  salePriceKnown: boolean;
  soldAmount: number;
  warehouses: { warehouseId: string | null; name: string | null; branchName: string | null; quantity: number }[];
}

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    private readonly dataSource: DataSource,
  ) {}

  /** Filtr uchun filiallar va omborxonalar - qoldiqni ko'ruvchiga alohida huquq kerak bo'lmasin */
  async options() {
    const [branches, warehouses] = await Promise.all([
      this.branchRepo.find({ order: { name: 'ASC' } }),
      this.warehouseRepo.find({ order: { name: 'ASC' } }),
    ]);
    return {
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name, isActive: branch.isActive })),
      warehouses: warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, branchId: warehouse.branchId, isActive: warehouse.isActive })),
    };
  }

  /** Tanlangan filial / omborxona -> qaysi omborlar hisobga olinadi. null - hammasi */
  private async resolveScope({ branchId, warehouseId }: StockScope) {
    if (warehouseId) {
      const warehouse = await this.warehouseRepo.findOne({ where: { id: warehouseId } });
      if (!warehouse) throw new NotFoundException('Omborxona topilmadi');
      if (branchId && warehouse.branchId !== branchId) {
        throw new BadRequestException('Tanlangan omborxona bu filialga tegishli emas');
      }
      return [warehouse.id];
    }
    if (branchId) {
      const branch = await this.branchRepo.findOne({ where: { id: branchId } });
      if (!branch) throw new NotFoundException('Filial topilmadi');
      const warehouses = await this.warehouseRepo.find({ where: { branchId }, select: { id: true } });
      return warehouses.map((warehouse) => warehouse.id);
    }
    return null;
  }

  async report(scope: StockScope): Promise<{ scope: StockScope; totals: ReturnType<StockService['totals']>; rows: StockRow[] }> {
    const warehouseIds = await this.resolveScope(scope);
    // Filialda ombor yo'q - hisoblaydigan narsa ham yo'q
    if (warehouseIds && !warehouseIds.length) return this.empty(scope);

    const [inbound, outbound, lastPrices] = await Promise.all([
      this.inboundMovements(warehouseIds),
      this.outboundMovements(warehouseIds),
      this.lastSalePrices(),
    ]);

    const materialIds = [...new Set([...inbound, ...outbound].map((row) => row.materialId))];
    if (!materialIds.length) return this.empty(scope);

    const [materials, warehouses] = await Promise.all([
      this.materialRepo.find({
        where: { id: In(materialIds) },
        relations: { unit: true, category: true, brand: true, color: true, size: true, images: true },
      }),
      this.warehouseRepo.find({ relations: { branch: true } }),
    ]);
    const materialById = new Map(materials.map((material) => [material.id, material]));
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

    // Tovar bo'yicha yig'indi + ombor kesimidagi qoldiq
    const byMaterial = new Map<string, {
      inQuantity: number; inAmount: number; outQuantity: number; outAmount: number;
      byWarehouse: Map<string, number>;
    }>();
    const pick = (materialId: string) => {
      let row = byMaterial.get(materialId);
      if (!row) {
        row = { inQuantity: 0, inAmount: 0, outQuantity: 0, outAmount: 0, byWarehouse: new Map() };
        byMaterial.set(materialId, row);
      }
      return row;
    };
    const addToWarehouse = (row: { byWarehouse: Map<string, number> }, warehouseId: string | null, quantity: number) => {
      const key = warehouseId || '';
      row.byWarehouse.set(key, (row.byWarehouse.get(key) || 0) + quantity);
    };

    for (const move of inbound) {
      const row = pick(move.materialId);
      row.inQuantity += move.qty;
      row.inAmount += move.amount;
      addToWarehouse(row, move.warehouseId, move.qty);
    }
    for (const move of outbound) {
      const row = pick(move.materialId);
      row.outQuantity += move.qty;
      row.outAmount += move.amount;
      addToWarehouse(row, move.warehouseId, -move.qty);
    }

    const rows: StockRow[] = [...byMaterial]
      .map(([materialId, data]): StockRow => {
        const material = materialById.get(materialId);
        const quantity = Number((data.inQuantity - data.outQuantity).toFixed(3));
        // O'rtacha kirim narxi - qoldiqning tannarxi shu narxda hisoblanadi
        const avgCost = data.inQuantity > 0 ? data.inAmount / data.inQuantity : 0;
        const cardPrice = material?.salePrice ?? null;
        const salePrice = cardPrice ?? lastPrices.get(materialId) ?? 0;
        const costAmount = roundMoney(quantity * avgCost);
        const saleAmount = roundMoney(quantity * salePrice);
        return {
          materialId,
          material: material ? {
            id: material.id, name: material.name, sku: material.sku, barcode: material.barcode,
            unit: material.unit, category: material.category, brand: material.brand, color: material.color, size: material.size,
            images: material.images,
          } : null,
          inQuantity: Number(data.inQuantity.toFixed(3)),
          outQuantity: Number(data.outQuantity.toFixed(3)),
          quantity,
          avgCost: roundMoney(avgCost),
          costAmount,
          salePrice: roundMoney(salePrice),
          saleAmount,
          profit: roundMoney(saleAmount - costAmount),
          /** Sotuv narxi noma'lum: tovar hali sotilmagan */
          salePriceKnown: cardPrice !== null || lastPrices.has(materialId),
          soldAmount: roundMoney(data.outAmount),
          warehouses: [...data.byWarehouse]
            .filter(([, quantityInWarehouse]) => Math.abs(quantityInWarehouse) > 0.0005)
            .map(([warehouseId, quantityInWarehouse]) => {
              const warehouse = warehouseId ? warehouseById.get(warehouseId) : null;
              return {
                warehouseId: warehouseId || null,
                name: warehouse?.name || null,
                branchName: warehouse?.branch?.name || null,
                quantity: Number(quantityInWarehouse.toFixed(3)),
              };
            })
            .sort((a, b) => b.quantity - a.quantity),
        };
      })
      .sort((a, b) => b.quantity - a.quantity || (a.material?.name || '').localeCompare(b.material?.name || ''));

    return { scope, totals: this.totals(rows), rows };
  }

  private totals(rows: StockRow[]) {
    const inStock = rows.filter((row) => row.quantity > 0);
    const sum = (list: StockRow[], get: (row: StockRow) => number) => list.reduce((total, row) => total + get(row), 0);
    const costAmount = roundMoney(sum(inStock, (row) => row.costAmount));
    const saleAmount = roundMoney(sum(inStock, (row) => row.saleAmount));
    return {
      /** Qoldiqda turgan tovar turlari (SKU) */
      skuCount: inStock.length,
      quantity: Number(sum(inStock, (row) => row.quantity).toFixed(3)),
      costAmount,
      saleAmount,
      profit: roundMoney(saleAmount - costAmount),
      /** Ustama: (sotuv - kirim) / kirim, % */
      margin: costAmount > 0 ? Math.round(((saleAmount - costAmount) / costAmount) * 1000) / 10 : null,
      /** Qoldig'i manfiy chiqqan tovarlar - chiqim kirimdan ko'p */
      negativeCount: rows.filter((row) => row.quantity < 0).length,
      /** Qoldiqda bor, lekin hali sotilmagan - sotuv summasiga kirmaydi */
      unknownPriceCount: inStock.filter((row) => !row.salePriceKnown).length,
      soldAmount: roundMoney(sum(rows, (row) => row.soldAmount)),
    };
  }

  private empty(scope: StockScope) {
    return {
      scope,
      totals: { skuCount: 0, quantity: 0, costAmount: 0, saleAmount: 0, profit: 0, margin: null, negativeCount: 0, unknownPriceCount: 0, soldAmount: 0 },
      rows: [] as StockRow[],
    };
  }

  /**
   * Kirim: tasdiqlangan hujjatlar. Summa so'mda - hujjat valyutasi bo'lsa
   * sanasidagi kurs bilan (o'sha sanagacha oxirgisi, bo'lmasa eng eskisi).
   */
  private inboundMovements(warehouseIds: string[] | null): Promise<Movement[]> {
    return this.dataSource.query(
      `SELECT item."materialId"                                                   AS "materialId",
              doc."warehouseId"                                                   AS "warehouseId",
              SUM(item.quantity)::float8                                          AS qty,
              SUM(item.quantity * item.price * COALESCE(onDate.rate, oldest.rate, 1))::float8 AS amount
         FROM inbound_document_items item
         JOIN inbound_documents doc ON doc.id = item."documentId"
         LEFT JOIN LATERAL (
              SELECT rate FROM currency_rates
               WHERE "currencyId" = doc."currencyId" AND date <= doc."documentDate"
               ORDER BY date DESC LIMIT 1
         ) onDate ON TRUE
         LEFT JOIN LATERAL (
              SELECT rate FROM currency_rates
               WHERE "currencyId" = doc."currencyId"
               ORDER BY date ASC LIMIT 1
         ) oldest ON TRUE
        WHERE doc.status = 'APPROVED'
          AND ($1::uuid[] IS NULL OR doc."warehouseId" = ANY ($1))
        GROUP BY 1, 2`,
      [warehouseIds],
    );
  }

  /** Chiqim: tasdiqlangan sotuvlar (narxlar so'mda) */
  private outboundMovements(warehouseIds: string[] | null): Promise<Movement[]> {
    return this.dataSource.query(
      `SELECT item."materialId"              AS "materialId",
              doc."warehouseId"              AS "warehouseId",
              SUM(item.quantity)::float8     AS qty,
              SUM(item.quantity * item.price)::float8 AS amount
         FROM outbound_document_items item
         JOIN outbound_documents doc ON doc.id = item."documentId"
        WHERE doc.status = 'APPROVED'
          AND ($1::uuid[] IS NULL OR doc."warehouseId" = ANY ($1))
        GROUP BY 1, 2`,
      [warehouseIds],
    );
  }

  /** Tovarning oxirgi sotuv narxi - qoldiqni sotuv summasida ko'rsatish uchun */
  private async lastSalePrices() {
    const rows: { materialId: string; price: number }[] = await this.dataSource.query(
      `SELECT DISTINCT ON (item."materialId") item."materialId" AS "materialId", item.price::float8 AS price
         FROM outbound_document_items item
         JOIN outbound_documents doc ON doc.id = item."documentId"
        WHERE doc.status = 'APPROVED'
        ORDER BY item."materialId", doc."documentDate" DESC, doc."createdAt" DESC`,
    );
    return new Map(rows.map((row) => [row.materialId, row.price]));
  }
}
