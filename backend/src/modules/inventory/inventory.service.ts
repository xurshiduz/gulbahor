import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { InventoryCount, InventoryStatus } from './entities/inventory-count.entity';
import { InventoryScan } from './entities/inventory-scan.entity';
import { InventoryCountItem } from './entities/inventory-count-item.entity';
import { CreateInventoryDto, UpdateInventoryDto } from './dto/inventory.dto';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { User } from '../users/entities/user.entity';
import { RfidTag } from '../inbound-documents/entities/rfid-tag.entity';
import { normalizeEpc } from '../inbound-documents/labels/epc';
import { StockService } from '../stock/stock.service';
import { today } from '../accounting/services/currencies.service';
import { roundMoney } from '../references/common/numeric';

const person = (user?: User | null) => (user ? { id: user.id, name: user.name } : null);
const round3 = (value: number) => Number((value || 0).toFixed(3));

/** Skanerlangan bitta kodning natijasi - skaner ekranida ko'rsatiladi */
export type ScanStatus = 'new' | 'duplicate' | 'unknown' | 'barcode' | 'not_found';

/**
 * Inventarizatsiya.
 *
 *  1. Yaratiladi: filial, ombor, rejadagi sanalar, mas'ul (PLANNED)
 *  2. Boshlanadi (IN_PROGRESS) - skaner kodlarni yuboradi: RFID metka har
 *     biri bir marta, shtrix-kod har skanerlashda +1
 *  3. Tugatiladi (COMPLETED) - omborning tizimdagi qoldig'i bilan
 *     solishtirilib natija qotiriladi: kamomad va ortiqcha
 */
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryCount) private readonly repo: Repository<InventoryCount>,
    @InjectRepository(InventoryScan) private readonly scanRepo: Repository<InventoryScan>,
    @InjectRepository(InventoryCountItem) private readonly itemRepo: Repository<InventoryCountItem>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RfidTag) private readonly tagRepo: Repository<RfidTag>,
    private readonly stock: StockService,
    private readonly dataSource: DataSource,
  ) {}

  /* ---------------------------------- Ro'yxat ---------------------------------- */

  private view(row: InventoryCount) {
    const { branch, warehouse, responsible, finishedBy, createdBy, ...rest } = row;
    return {
      ...rest,
      branch: branch ? { id: branch.id, name: branch.name } : null,
      warehouse: warehouse ? { id: warehouse.id, name: warehouse.name } : null,
      responsible: person(responsible),
      finishedBy: person(finishedBy),
      createdBy: person(createdBy),
    };
  }

  /** Sanalgan: dona (tovar aniqlangan), tovar turlari, noma'lum metkalar */
  private async progress(countIds: string[]) {
    const result = new Map<string, { counted: number; skuCount: number; unknown: number; lastScanAt: string | null }>();
    if (!countIds.length) return result;
    const rows = await this.dataSource.query(
      `SELECT "countId",
              COALESCE(SUM(quantity) FILTER (WHERE "materialId" IS NOT NULL), 0)::float8 AS counted,
              COUNT(DISTINCT "materialId")::int AS "skuCount",
              COUNT(*) FILTER (WHERE "materialId" IS NULL)::int AS unknown,
              MAX("createdAt") AS "lastScanAt"
         FROM inventory_scans WHERE "countId" = ANY ($1) GROUP BY "countId"`,
      [countIds],
    );
    for (const row of rows) result.set(row.countId, { counted: round3(row.counted), skuCount: row.skuCount, unknown: row.unknown, lastScanAt: row.lastScanAt });
    return result;
  }

  /** Tugatilganlar uchun natija yig'indisi */
  private async resultTotals(countIds: string[]) {
    const result = new Map<string, ReturnType<InventoryService['totalsOf']>>();
    if (!countIds.length) return result;
    const items = await this.itemRepo.find({ where: { countId: In(countIds) } });
    const byCount = new Map<string, InventoryCountItem[]>();
    for (const item of items) byCount.set(item.countId, [...(byCount.get(item.countId) || []), item]);
    for (const [id, list] of byCount) result.set(id, this.totalsOf(list));
    return result;
  }

  async findAll() {
    const rows = await this.repo.find({
      relations: { branch: true, warehouse: true, responsible: true, createdBy: true },
      order: { createdAt: 'DESC' },
    });
    const ids = rows.map((row) => row.id);
    const [progress, totals] = await Promise.all([this.progress(ids), this.resultTotals(ids.filter((id, i) => rows[i].status === InventoryStatus.COMPLETED))]);
    return rows.map((row) => ({
      ...this.view(row),
      progress: progress.get(row.id) || { counted: 0, skuCount: 0, unknown: 0, lastScanAt: null },
      totals: totals.get(row.id) || null,
    }));
  }

  private async entity(id: string) {
    const row = await this.repo.findOne({
      where: { id },
      relations: { branch: true, warehouse: true, responsible: true, finishedBy: true, createdBy: true },
    });
    if (!row) throw new NotFoundException('Inventarizatsiya topilmadi');
    return row;
  }

  async findOne(id: string) {
    const row = await this.entity(id);
    const progress = (await this.progress([id])).get(id) || { counted: 0, skuCount: 0, unknown: 0, lastScanAt: null };
    return { ...this.view(row), progress };
  }

  /** Forma uchun: filiallar, omborlar, xodimlar */
  async options() {
    const [branches, warehouses, users] = await Promise.all([
      this.branchRepo.find({ order: { name: 'ASC' } }),
      this.warehouseRepo.find({ order: { name: 'ASC' } }),
      this.userRepo.find({ where: { isActive: true }, order: { name: 'ASC' } }),
    ]);
    return {
      branches: branches.map((row) => ({ id: row.id, name: row.name, isActive: row.isActive })),
      warehouses: warehouses.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId, isActive: row.isActive })),
      users: users.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  /* ------------------------------ Yaratish / o'zgartirish ------------------------------ */

  private async prepare(dto: UpdateInventoryDto, existing?: InventoryCount) {
    const data: Partial<InventoryCount> = {};
    const branchId = dto.branchId || existing?.branchId;
    if (dto.branchId) {
      if (!(await this.branchRepo.findOne({ where: { id: dto.branchId } }))) throw new NotFoundException('Filial topilmadi');
      data.branchId = dto.branchId;
    }
    const warehouseId = dto.warehouseId || existing?.warehouseId;
    if (dto.warehouseId || dto.branchId) {
      const warehouse = await this.warehouseRepo.findOne({ where: { id: warehouseId } });
      if (!warehouse) throw new NotFoundException('Omborxona topilmadi');
      if (warehouse.branchId !== branchId) throw new BadRequestException('Omborxona tanlangan filialga tegishli emas');
      data.warehouseId = warehouse.id;
    }
    for (const key of ['startDate', 'endDate'] as const) {
      if (dto[key] !== undefined) {
        if (Number.isNaN(Date.parse(dto[key] as string))) throw new BadRequestException('Sana notog`ri');
        data[key] = dto[key];
      }
    }
    const start = data.startDate || existing?.startDate;
    const end = data.endDate || existing?.endDate;
    if (start && end && start > end) throw new BadRequestException('Tugash sanasi boshlanishdan oldin bo`lmasligi kerak');
    if (dto.responsibleId !== undefined) {
      if (dto.responsibleId && !(await this.userRepo.findOne({ where: { id: dto.responsibleId } }))) throw new NotFoundException('Mas`ul xodim topilmadi');
      data.responsibleId = dto.responsibleId || null;
    }
    if (dto.description !== undefined) data.description = String(dto.description || '').trim() || null;
    return data;
  }

  /** Navbatdagi raqam: INV26-000001 */
  private async nextNumber() {
    const prefix = `INV${today().slice(2, 4)}-`;
    const last = await this.repo.createQueryBuilder('c').where('c.number LIKE :p', { p: `${prefix}%` }).orderBy('c.number', 'DESC').getOne();
    let next = (last ? parseInt(last.number.slice(prefix.length), 10) || 0 : 0) + 1;
    for (;;) {
      const candidate = `${prefix}${String(next).padStart(6, '0')}`;
      if (!(await this.repo.findOne({ where: { number: candidate } }))) return candidate;
      next += 1;
    }
  }

  async create(dto: CreateInventoryDto, userId?: string) {
    const data = await this.prepare(dto);
    // Bitta omborda bir vaqtda ikkita ochiq inventarizatsiya bo'lmasin
    const open = await this.repo.findOne({ where: { warehouseId: data.warehouseId, status: In([InventoryStatus.PLANNED, InventoryStatus.IN_PROGRESS]) } });
    if (open) throw new BadRequestException(`Bu omborda ochiq inventarizatsiya bor: ${open.number}`);
    const row = await this.repo.save(this.repo.create({ ...data, number: await this.nextNumber(), status: InventoryStatus.PLANNED, createdById: userId || null }));
    return this.findOne(row.id);
  }

  async update(id: string, dto: UpdateInventoryDto) {
    const row = await this.entity(id);
    if (row.status === InventoryStatus.COMPLETED || row.status === InventoryStatus.CANCELLED) {
      throw new BadRequestException('Tugatilgan yoki bekor qilingan inventarizatsiyani o`zgartirib bo`lmaydi');
    }
    // Sanash boshlangach ombor almashtirilmaydi - sanalganlar boshqa omborniki bo'lib qoladi
    if (row.status === InventoryStatus.IN_PROGRESS && ((dto.warehouseId && dto.warehouseId !== row.warehouseId) || (dto.branchId && dto.branchId !== row.branchId))) {
      throw new BadRequestException('Sanash boshlangan - filial va omborni o`zgartirib bo`lmaydi');
    }
    await this.repo.update(id, await this.prepare(dto, row));
    return this.findOne(id);
  }

  async remove(id: string) {
    const row = await this.entity(id);
    if (row.status === InventoryStatus.IN_PROGRESS || row.status === InventoryStatus.COMPLETED) {
      throw new BadRequestException('Boshlangan yoki tugatilgan inventarizatsiyani o`chirib bo`lmaydi - bekor qiling');
    }
    await this.repo.delete(id);
    return { success: true };
  }

  /* ---------------------------------- Holat ---------------------------------- */

  async start(id: string) {
    const row = await this.entity(id);
    if (row.status === InventoryStatus.IN_PROGRESS) return this.findOne(id);
    if (row.status !== InventoryStatus.PLANNED) throw new BadRequestException('Faqat rejalashtirilgan inventarizatsiya boshlanadi');
    await this.repo.update(id, { status: InventoryStatus.IN_PROGRESS, startedAt: new Date() });
    return this.findOne(id);
  }

  async cancel(id: string) {
    const row = await this.entity(id);
    if (row.status === InventoryStatus.COMPLETED) throw new BadRequestException('Tugatilgan inventarizatsiyani bekor qilib bo`lmaydi - qayta oching');
    await this.repo.update(id, { status: InventoryStatus.CANCELLED });
    return this.findOne(id);
  }

  /**
   * Tugatish: omborning tizimdagi qoldig'i (tasdiqlangan hujjatlardan) va
   * sanalgani solishtirilib natija qotiriladi.
   */
  async finish(id: string, userId?: string) {
    const row = await this.entity(id);
    if (row.status !== InventoryStatus.IN_PROGRESS) throw new BadRequestException('Faqat sanalayotgan inventarizatsiya tugatiladi');

    const [{ rows: stockRows }, counted] = await Promise.all([
      this.stock.report({ warehouseId: row.warehouseId }),
      this.scanRepo.createQueryBuilder('s')
        .select('s.materialId', 'materialId').addSelect('SUM(s.quantity)::float8', 'qty')
        .where('s.countId = :id AND s.materialId IS NOT NULL', { id })
        .groupBy('s.materialId').getRawMany<{ materialId: string; qty: number }>(),
    ]);
    const countedBy = new Map(counted.map((item) => [item.materialId, round3(Number(item.qty))]));
    const stockBy = new Map(stockRows.map((item) => [item.materialId, item]));

    // Sanalgan, lekin bu omborda hech qachon harakati bo'lmagan tovar narxi
    const missingIds = [...countedBy.keys()].filter((materialId) => !stockBy.has(materialId));
    const extraMaterials = missingIds.length ? await this.materialRepo.findBy({ id: In(missingIds) }) : [];
    const salePriceOf = new Map(extraMaterials.map((material) => [material.id, material.salePrice || 0]));

    const materialIds = new Set([...stockRows.filter((item) => Math.abs(item.quantity) > 0.0005).map((item) => item.materialId), ...countedBy.keys()]);
    const items = [...materialIds].map((materialId) => {
      const stockRow = stockBy.get(materialId);
      const expected = round3(stockRow?.quantity || 0);
      const countedQty = countedBy.get(materialId) || 0;
      return this.itemRepo.create({
        countId: id, materialId, expected, counted: countedQty, difference: round3(countedQty - expected),
        costPrice: roundMoney(stockRow?.avgCost || 0),
        salePrice: roundMoney(stockRow?.salePriceKnown ? stockRow.salePrice : salePriceOf.get(materialId) || 0),
      });
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(InventoryCountItem, { countId: id });
      if (items.length) await manager.save(InventoryCountItem, items);
      await manager.update(InventoryCount, id, { status: InventoryStatus.COMPLETED, finishedAt: new Date(), finishedById: userId || null });
    });
    return this.report(id);
  }

  /** Qayta ochish: natija o'chiriladi, sanalganlar qoladi - davom ettirish mumkin */
  async reopen(id: string) {
    const row = await this.entity(id);
    if (row.status !== InventoryStatus.COMPLETED) throw new BadRequestException('Faqat tugatilgan inventarizatsiya qayta ochiladi');
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(InventoryCountItem, { countId: id });
      await manager.update(InventoryCount, id, { status: InventoryStatus.IN_PROGRESS, finishedAt: null, finishedById: null });
    });
    return this.findOne(id);
  }

  /* ---------------------------------- Skaner ---------------------------------- */

  /**
   * Skanerdan kelgan kodlar. RFID (24 hex, PC so'zi bilan ham) - metka
   * bo'yicha tovar topiladi va bir marta sanaladi; boshqa kod - shtrix-kod
   * yoki artikul, har biri +1 dona.
   */
  async scan(id: string, codes: string[], userId?: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Inventarizatsiya topilmadi');
    if (row.status !== InventoryStatus.IN_PROGRESS) {
      throw new BadRequestException(row.status === InventoryStatus.PLANNED ? 'Inventarizatsiya hali boshlanmagan' : 'Inventarizatsiya yopilgan - sanash qabul qilinmaydi');
    }

    const cleaned = codes.map((code) => String(code || '').trim()).filter(Boolean);
    const epcs = [...new Set(cleaned.map(normalizeEpc).filter(Boolean) as string[])];
    const plain = [...new Set(cleaned.filter((code) => !normalizeEpc(code)).map((code) => code.toLowerCase()))];

    const [tags, already, materials] = await Promise.all([
      epcs.length ? this.tagRepo.find({ where: { epc: In(epcs) } }) : Promise.resolve([] as RfidTag[]),
      epcs.length ? this.scanRepo.find({ where: { countId: id, epc: In(epcs) }, select: { id: true, epc: true } }) : Promise.resolve([] as InventoryScan[]),
      plain.length
        ? this.materialRepo.createQueryBuilder('m')
            .where('LOWER(m.barcode) IN (:...codes) OR LOWER(m.sku) IN (:...codes)', { codes: plain })
            .getMany()
        : Promise.resolve([] as Material[]),
    ]);
    const tagBy = new Map(tags.map((tag) => [tag.epc, tag]));
    const seen = new Set(already.map((scan) => scan.epc));
    const byCode = new Map<string, Material>();
    for (const material of materials) {
      if (material.barcode) byCode.set(material.barcode.toLowerCase(), material);
      if (material.sku && !byCode.has(material.sku.toLowerCase())) byCode.set(material.sku.toLowerCase(), material);
    }
    const materialIds = [...new Set([...tags.map((tag) => tag.materialId), ...materials.map((material) => material.id)])];
    const names = new Map((materialIds.length ? await this.materialRepo.find({ where: { id: In(materialIds) }, relations: { size: true, color: true } }) : [])
      .map((material) => [material.id, material]));

    const results: { code: string; status: ScanStatus; epc?: string; material?: { id: string; name: string; sku: string | null; size: string | null } | null }[] = [];
    const inserts: Partial<InventoryScan>[] = [];
    const short = (materialId?: string | null) => {
      const material = materialId ? names.get(materialId) : null;
      return material ? { id: material.id, name: material.name, sku: material.sku || null, size: material.size?.name || null } : null;
    };

    for (const code of cleaned) {
      const epc = normalizeEpc(code);
      if (epc) {
        if (seen.has(epc)) { results.push({ code, epc, status: 'duplicate', material: short(tagBy.get(epc)?.materialId) }); continue; }
        seen.add(epc);
        const tag = tagBy.get(epc);
        inserts.push({ countId: id, epc, materialId: tag?.materialId || null, quantity: 1, scannedById: userId || null });
        results.push({ code, epc, status: tag ? 'new' : 'unknown', material: short(tag?.materialId) });
        continue;
      }
      const material = byCode.get(code.toLowerCase());
      if (!material) { results.push({ code, status: 'not_found' }); continue; }
      inserts.push({ countId: id, code, materialId: material.id, quantity: 1, scannedById: userId || null });
      results.push({ code, status: 'barcode', material: short(material.id) });
    }

    if (inserts.length) {
      // Parallel skanerlar bir metkani bir vaqtda yuborsa - ikkinchisi jim o'tkazib yuboriladi
      await this.scanRepo.createQueryBuilder().insert().into(InventoryScan).values(inserts as any).orIgnore().execute();
    }
    const progress = (await this.progress([id])).get(id) || { counted: 0, skuCount: 0, unknown: 0, lastScanAt: null };
    return { results, progress };
  }

  /** Oxirgi skanerlashlar - skaner ekrani va tafsilot sahifasi uchun */
  async recentScans(id: string, limit = 50) {
    const rows = await this.scanRepo.find({
      where: { countId: id }, relations: { material: { size: true, color: true }, scannedBy: true },
      order: { createdAt: 'DESC' }, take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.map((row) => ({
      id: row.id, epc: row.epc, code: row.code, quantity: row.quantity, createdAt: row.createdAt,
      material: row.material ? { id: row.material.id, name: row.material.name, sku: row.material.sku, size: row.material.size?.name || null } : null,
      scannedBy: person(row.scannedBy),
    }));
  }

  /** Bitta skanerlashni bekor qilish (xato o'qilgan shtrix-kod yoki metka) */
  async removeScan(id: string, scanId: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Inventarizatsiya topilmadi');
    if (row.status !== InventoryStatus.IN_PROGRESS) throw new BadRequestException('Inventarizatsiya yopilgan');
    const result = await this.scanRepo.delete({ id: scanId, countId: id });
    if (!result.affected) throw new NotFoundException('Skanerlash topilmadi');
    return (await this.progress([id])).get(id) || { counted: 0, skuCount: 0, unknown: 0, lastScanAt: null };
  }

  /* --------------------------------- Hisobot --------------------------------- */

  private totalsOf(items: InventoryCountItem[]) {
    let expected = 0, counted = 0, shortageQty = 0, surplusQty = 0, shortageCost = 0, surplusCost = 0, shortageSale = 0, surplusSale = 0, matched = 0;
    for (const item of items) {
      expected += item.expected;
      counted += item.counted;
      if (item.difference < 0) {
        shortageQty += -item.difference; shortageCost += -item.difference * item.costPrice; shortageSale += -item.difference * item.salePrice;
      } else if (item.difference > 0) {
        surplusQty += item.difference; surplusCost += item.difference * item.costPrice; surplusSale += item.difference * item.salePrice;
      } else matched += 1;
    }
    return {
      positions: items.length, matched,
      expected: round3(expected), counted: round3(counted),
      shortageQty: round3(shortageQty), surplusQty: round3(surplusQty),
      shortageCost: roundMoney(shortageCost), surplusCost: roundMoney(surplusCost),
      shortageSale: roundMoney(shortageSale), surplusSale: roundMoney(surplusSale),
      /** Sof farq tannarxda: ortiqcha - kamomad */
      netCost: roundMoney(surplusCost - shortageCost),
      /** Aniqlik: to'liq mos kelgan pozitsiyalar ulushi */
      accuracy: items.length ? Math.round((matched / items.length) * 1000) / 10 : 100,
    };
  }

  async report(id: string) {
    const row = await this.entity(id);
    const [items, unknownTags] = await Promise.all([
      this.itemRepo.find({ where: { countId: id }, relations: { material: { unit: true, size: true, color: true, brand: true, category: true } } }),
      this.scanRepo.find({ where: { countId: id, materialId: IsNull() }, order: { createdAt: 'ASC' }, take: 500 }),
    ]);
    const list = items
      .map((item) => ({
        materialId: item.materialId,
        material: item.material ? {
          id: item.material.id, name: item.material.name, sku: item.material.sku, barcode: item.material.barcode,
          unit: item.material.unit?.shortName || null, size: item.material.size?.name || null,
          color: item.material.color?.name || null, brand: item.material.brand?.name || null, category: item.material.category?.name || null,
        } : null,
        expected: item.expected, counted: item.counted, difference: item.difference,
        costPrice: item.costPrice, salePrice: item.salePrice,
        differenceCost: roundMoney(item.difference * item.costPrice),
        differenceSale: roundMoney(item.difference * item.salePrice),
      }))
      // Avval kamomad (eng kattasi), keyin ortiqcha, oxirida mos kelganlar
      .sort((a, b) => a.difference - b.difference || (a.material?.name || '').localeCompare(b.material?.name || ''));
    return {
      inventory: this.view(row),
      completed: row.status === InventoryStatus.COMPLETED,
      totals: row.status === InventoryStatus.COMPLETED ? this.totalsOf(items) : null,
      items: list,
      unknownTags: unknownTags.filter((scan) => scan.epc).map((scan) => ({ epc: scan.epc, createdAt: scan.createdAt })),
    };
  }
}
