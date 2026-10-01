import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Transfer, TransferStatus } from './entities/transfer.entity';
import { TransferItem } from './entities/transfer-item.entity';
import { TransferTag } from './entities/transfer-tag.entity';
import { CreateTransferDto, ReceiveTransferDto, TransferItemDto, UpdateTransferDto } from './dto/transfers.dto';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { User } from '../users/entities/user.entity';
import { RfidTag } from '../inbound-documents/entities/rfid-tag.entity';
import { normalizeEpc } from '../inbound-documents/labels/epc';
import { StockService } from '../stock/stock.service';
import { userIsAdmin } from '../auth/permissions.util';
import { today } from '../accounting/services/currencies.service';

const person = (user?: User | null) => (user ? { id: user.id, name: user.name } : null);
const round3 = (value: number) => Number((value || 0).toFixed(3));

/**
 * Ko'chirish: yuboruvchi tovar qo'shadi (qo'lda yoki RFID) va yuboradi,
 * qabul qiluvchi sanab qabul qiladi.
 *
 *   DRAFT --yuborish--> SENT --qabul--> RECEIVED
 *     ^                  |
 *     +---qaytarib olish-+
 *
 * Filial bo'yicha cheklov: xodimga filial biriktirilgan bo'lsa - faqat o'z
 * filialidan yuboradi va o'z filialiga kelganini qabul qiladi
 * (administratorlarga cheklov yo'q).
 */
@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(Transfer) private readonly repo: Repository<Transfer>,
    @InjectRepository(TransferItem) private readonly itemRepo: Repository<TransferItem>,
    @InjectRepository(TransferTag) private readonly tagRepo: Repository<TransferTag>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    @InjectRepository(RfidTag) private readonly rfidRepo: Repository<RfidTag>,
    private readonly stock: StockService,
    private readonly dataSource: DataSource,
  ) {}

  /* --------------------------------- Ruxsat --------------------------------- */

  /** Xodimning filiali (administrator - cheklovsiz: null) */
  private branchOf(user: any): string | null {
    return userIsAdmin(user) ? null : user?.branchId || null;
  }

  private assertSender(transfer: { fromBranchId: string }, user: any) {
    const branch = this.branchOf(user);
    if (branch && branch !== transfer.fromBranchId) throw new ForbiddenException('Faqat o`z filialingizdan tovar yubora olasiz');
  }

  private assertReceiver(transfer: { toBranchId: string }, user: any) {
    const branch = this.branchOf(user);
    if (branch && branch !== transfer.toBranchId) throw new ForbiddenException('Bu ko`chirish sizning filialingizga emas - qabul qila olmaysiz');
  }

  /* --------------------------------- Ko'rish --------------------------------- */

  private view(row: Transfer, user?: any) {
    const { fromBranch, fromWarehouse, toBranch, toWarehouse, createdBy, sentBy, receivedBy, items, ...rest } = row;
    const branch = user ? this.branchOf(user) : null;
    return {
      ...rest,
      fromBranch: fromBranch ? { id: fromBranch.id, name: fromBranch.name } : null,
      fromWarehouse: fromWarehouse ? { id: fromWarehouse.id, name: fromWarehouse.name } : null,
      toBranch: toBranch ? { id: toBranch.id, name: toBranch.name } : null,
      toWarehouse: toWarehouse ? { id: toWarehouse.id, name: toWarehouse.name } : null,
      createdBy: person(createdBy), sentBy: person(sentBy), receivedBy: person(receivedBy),
      /** Shu xodim uchun yo'nalish: chiquvchi / kiruvchi */
      direction: !branch ? null : row.fromBranchId === branch ? 'OUT' : row.toBranchId === branch ? 'IN' : null,
    };
  }

  async findAll(user: any) {
    const branch = this.branchOf(user);
    const rows = await this.repo.find({
      where: branch ? [{ fromBranchId: branch }, { toBranchId: branch }] : {},
      relations: { fromBranch: true, fromWarehouse: true, toBranch: true, toWarehouse: true, createdBy: true, items: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      ...this.view(row, user),
      itemsCount: row.items.length,
      totalQuantity: round3(row.items.reduce((sum, item) => sum + item.quantity, 0)),
      receivedQuantity: row.status === TransferStatus.RECEIVED ? round3(row.items.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0)) : null,
    }));
  }

  async findOne(id: string, user?: any) {
    const row = await this.repo.findOne({
      where: { id },
      relations: {
        fromBranch: true, fromWarehouse: true, toBranch: true, toWarehouse: true, createdBy: true, sentBy: true, receivedBy: true,
        items: { material: { unit: true, color: true, size: true, brand: true, images: true } },
      },
      order: { items: { sortOrder: 'ASC' } },
    });
    if (!row) throw new NotFoundException('Ko`chirish topilmadi');
    const branch = user ? this.branchOf(user) : null;
    if (branch && row.fromBranchId !== branch && row.toBranchId !== branch) throw new ForbiddenException('Bu ko`chirish sizning filialingizga tegishli emas');
    const tags = await this.tagRepo.find({ where: { transferId: id }, order: { epc: 'ASC' } });
    return {
      ...this.view(row, user),
      items: row.items.map((item) => ({
        id: item.id, materialId: item.materialId, material: item.material, quantity: item.quantity, receivedQuantity: item.receivedQuantity,
        tags: tags.filter((tag) => tag.materialId === item.materialId).length,
      })),
      tags: tags.map((tag) => ({ epc: tag.epc, materialId: tag.materialId, receivedAt: tag.receivedAt })),
    };
  }

  /** Forma uchun: filiallar, omborlar va xodimning filiali */
  async options(user: any) {
    const [branches, warehouses] = await Promise.all([
      this.branchRepo.find({ order: { name: 'ASC' } }),
      this.warehouseRepo.find({ order: { name: 'ASC' } }),
    ]);
    return {
      branches: branches.map((row) => ({ id: row.id, name: row.name, isActive: row.isActive })),
      warehouses: warehouses.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId, isActive: row.isActive })),
      myBranchId: this.branchOf(user),
    };
  }

  /* ------------------------------ Tovar aniqlash ------------------------------ */

  /**
   * Skaner kodlari: RFID metka (EPC) yoki shtrix-kod / artikul -> tovar.
   * Yuboruvchi ham, qabul qiluvchi ham shu orqali qo'shadi / sanaydi.
   */
  async resolve(codes: string[]) {
    const cleaned = codes.map((code) => String(code || '').trim()).filter(Boolean);
    const epcs = [...new Set(cleaned.map(normalizeEpc).filter(Boolean) as string[])];
    const plain = [...new Set(cleaned.filter((code) => !normalizeEpc(code)).map((code) => code.toLowerCase()))];
    const [tags, byCode] = await Promise.all([
      epcs.length ? this.rfidRepo.find({ where: { epc: In(epcs) } }) : Promise.resolve([] as RfidTag[]),
      plain.length
        ? this.materialRepo.createQueryBuilder('m').where('LOWER(m.barcode) IN (:...c) OR LOWER(m.sku) IN (:...c)', { c: plain }).getMany()
        : Promise.resolve([] as Material[]),
    ]);
    const ids = [...new Set([...tags.map((tag) => tag.materialId), ...byCode.map((material) => material.id)])];
    const materials = new Map((ids.length ? await this.materialRepo.find({ where: { id: In(ids) }, relations: { unit: true, color: true, size: true, brand: true, images: true } }) : [])
      .map((material) => [material.id, material]));
    const tagBy = new Map(tags.map((tag) => [tag.epc, tag]));
    const codeBy = new Map<string, Material>();
    for (const material of byCode) {
      if (material.barcode) codeBy.set(material.barcode.toLowerCase(), material);
      if (material.sku && !codeBy.has(material.sku.toLowerCase())) codeBy.set(material.sku.toLowerCase(), material);
    }
    return cleaned.map((code) => {
      const epc = normalizeEpc(code);
      if (epc) {
        const tag = tagBy.get(epc);
        return { code, kind: 'epc', epc, status: tag ? 'ok' : 'unknown', material: tag ? materials.get(tag.materialId) || null : null };
      }
      const material = codeBy.get(code.toLowerCase());
      return { code, kind: 'barcode', status: material ? 'ok' : 'not_found', material: material ? materials.get(material.id) || material : null };
    });
  }

  /* ---------------------------- Yaratish / o'zgartirish ---------------------------- */

  private async prepare(dto: UpdateTransferDto, existing?: Transfer) {
    const data: Partial<Transfer> = {};
    const fromId = dto.fromWarehouseId || existing?.fromWarehouseId;
    const toId = dto.toWarehouseId || existing?.toWarehouseId;
    if (dto.fromWarehouseId || dto.toWarehouseId) {
      const [from, to] = await Promise.all([
        this.warehouseRepo.findOne({ where: { id: fromId } }),
        this.warehouseRepo.findOne({ where: { id: toId } }),
      ]);
      if (!from) throw new NotFoundException('Yuboruvchi omborxona topilmadi');
      if (!to) throw new NotFoundException('Qabul qiluvchi omborxona topilmadi');
      if (from.id === to.id) throw new BadRequestException('Yuboruvchi va qabul qiluvchi ombor bir xil bo`lmasligi kerak');
      Object.assign(data, { fromWarehouseId: from.id, fromBranchId: from.branchId, toWarehouseId: to.id, toBranchId: to.branchId });
    }
    if (dto.description !== undefined) data.description = String(dto.description || '').trim() || null;
    return data;
  }

  /** Qatorlar va RFID metkalar: tovar takrorlanmaydi, metka soni qator sonidan oshmaydi */
  private async prepareItems(items: TransferItemDto[], epcList: string[] | undefined, transferId?: string) {
    const ids = [...new Set(items.map((item) => item.materialId))];
    if (ids.length !== items.length) throw new BadRequestException('Bitta tovar ikki marta kiritilgan - sonini bitta qatorda yozing');
    const materials = ids.length ? await this.materialRepo.findBy({ id: In(ids) }) : [];
    if (materials.length !== ids.length) throw new NotFoundException('Tanlangan tovarlardan biri topilmadi');
    const nameOf = new Map(materials.map((material) => [material.id, material.name]));

    const epcs = [...new Set((epcList || []).map((code) => normalizeEpc(code)).filter(Boolean) as string[])];
    if ((epcList || []).some((code) => !normalizeEpc(code))) throw new BadRequestException('RFID kodlardan biri notog`ri');
    const tags = epcs.length ? await this.rfidRepo.find({ where: { epc: In(epcs) } }) : [];
    if (tags.length !== epcs.length) {
      const known = new Set(tags.map((tag) => tag.epc));
      throw new BadRequestException(`Noma'lum RFID metka: ${epcs.find((epc) => !known.has(epc))}`);
    }
    const perMaterial = new Map<string, number>();
    for (const tag of tags) {
      if (!nameOf.has(tag.materialId)) throw new BadRequestException(`RFID metka ${tag.epc} ko'chirishdagi tovarlarga tegishli emas`);
      perMaterial.set(tag.materialId, (perMaterial.get(tag.materialId) || 0) + 1);
    }
    for (const item of items) {
      if ((perMaterial.get(item.materialId) || 0) > item.quantity) {
        throw new BadRequestException(`"${nameOf.get(item.materialId)}": RFID metkalar soni (${perMaterial.get(item.materialId)}) qatordagi sondan ko'p`);
      }
    }
    // Bitta metka bir vaqtda ikki ochiq ko'chirishda bo'lmasin
    if (epcs.length) {
      const busy = await this.tagRepo.createQueryBuilder('t').innerJoin('t.transfer', 'tr')
        .where('t.epc IN (:...epcs)', { epcs })
        .andWhere('tr.status IN (:...open)', { open: [TransferStatus.DRAFT, TransferStatus.SENT] })
        .andWhere(transferId ? 'tr.id != :id' : '1=1', { id: transferId })
        .select(['t.epc', 'tr.number']).getRawOne();
      if (busy) throw new BadRequestException(`RFID metka ${busy.t_epc} boshqa ochiq ko'chirishda (${busy.tr_number})`);
    }
    return {
      items: items.map((item, index) => ({ materialId: item.materialId, quantity: item.quantity, sortOrder: index + 1 })),
      tags: tags.map((tag) => ({ epc: tag.epc, materialId: tag.materialId })),
    };
  }

  private async nextNumber() {
    const prefix = `KO${today().slice(2, 4)}-`;
    const last = await this.repo.createQueryBuilder('t').where('t.number LIKE :p', { p: `${prefix}%` }).orderBy('t.number', 'DESC').getOne();
    let next = (last ? parseInt(last.number.slice(prefix.length), 10) || 0 : 0) + 1;
    for (;;) {
      const candidate = `${prefix}${String(next).padStart(6, '0')}`;
      if (!(await this.repo.findOne({ where: { number: candidate } }))) return candidate;
      next += 1;
    }
  }

  async create(dto: CreateTransferDto, user: any) {
    const header = await this.prepare(dto);
    this.assertSender(header as Transfer, user);
    const { items, tags } = await this.prepareItems(dto.items || [], dto.epcs);
    const id = await this.dataSource.transaction(async (manager) => {
      const row = await manager.save(Transfer, manager.create(Transfer, { ...header, number: await this.nextNumber(), status: TransferStatus.DRAFT, createdById: user?.id || null }));
      if (items.length) await manager.save(TransferItem, items.map((item) => manager.create(TransferItem, { ...item, transferId: row.id })));
      if (tags.length) await manager.save(TransferTag, tags.map((tag) => manager.create(TransferTag, { ...tag, transferId: row.id })));
      return row.id;
    });
    return this.findOne(id, user);
  }

  private async entity(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Ko`chirish topilmadi');
    return row;
  }

  async update(id: string, dto: UpdateTransferDto, user: any) {
    const row = await this.entity(id);
    this.assertSender(row, user);
    if (row.status !== TransferStatus.DRAFT) throw new BadRequestException('Yuborilgan ko`chirishni o`zgartirib bo`lmaydi - avval qaytarib oling');
    const header = await this.prepare(dto, row);
    if (header.fromBranchId) this.assertSender(header as Transfer, user);
    const prepared = dto.items ? await this.prepareItems(dto.items, dto.epcs, id) : null;
    await this.dataSource.transaction(async (manager) => {
      if (Object.keys(header).length) await manager.update(Transfer, id, header);
      if (prepared) {
        await manager.delete(TransferItem, { transferId: id });
        await manager.delete(TransferTag, { transferId: id });
        if (prepared.items.length) await manager.save(TransferItem, prepared.items.map((item) => manager.create(TransferItem, { ...item, transferId: id })));
        if (prepared.tags.length) await manager.save(TransferTag, prepared.tags.map((tag) => manager.create(TransferTag, { ...tag, transferId: id })));
      }
    });
    return this.findOne(id, user);
  }

  /* --------------------------------- Holat --------------------------------- */

  /** Yuborish: yuboruvchi omborda yetarli qoldiq bo'lishi shart */
  async send(id: string, user: any) {
    const row = await this.repo.findOne({ where: { id }, relations: { items: { material: true } } });
    if (!row) throw new NotFoundException('Ko`chirish topilmadi');
    this.assertSender(row, user);
    if (row.status !== TransferStatus.DRAFT) throw new BadRequestException('Faqat qoralama yuboriladi');
    if (!row.items.length) throw new BadRequestException('Tovar qo`shilmagan ko`chirishni yuborib bo`lmaydi');

    const { rows } = await this.stock.report({ warehouseId: row.fromWarehouseId });
    const available = new Map(rows.map((item) => [item.materialId, item.quantity]));
    const short = row.items.filter((item) => item.quantity > (available.get(item.materialId) || 0) + 0.0005);
    if (short.length) {
      throw new BadRequestException(`Omborda yetarli emas: ${short.map((item) => `"${item.material?.name}" (bor: ${round3(available.get(item.materialId) || 0)}, kerak: ${item.quantity})`).join(', ')}`);
    }
    await this.repo.update(id, { status: TransferStatus.SENT, sentAt: new Date(), sentById: user?.id || null });
    return this.findOne(id, user);
  }

  /** Qaytarib olish: hali qabul qilinmagan bo'lsa - qoralamaga */
  async recall(id: string, user: any) {
    const row = await this.entity(id);
    this.assertSender(row, user);
    if (row.status !== TransferStatus.SENT) throw new BadRequestException('Faqat yuborilgan (qabul qilinmagan) ko`chirish qaytarib olinadi');
    await this.repo.update(id, { status: TransferStatus.DRAFT, sentAt: null, sentById: null });
    return this.findOne(id, user);
  }

  /**
   * Qabul qilish: har qatorga haqiqatda kelgan soni (yuborilganidan
   * oshmaydi). RFID bilan kelgan donalar o'qilgan metkalar bo'yicha belgilanadi.
   */
  async receive(id: string, dto: ReceiveTransferDto, user: any) {
    const row = await this.repo.findOne({ where: { id }, relations: { items: true } });
    if (!row) throw new NotFoundException('Ko`chirish topilmadi');
    this.assertReceiver(row, user);
    if (row.status !== TransferStatus.SENT) throw new BadRequestException(row.status === TransferStatus.RECEIVED ? 'Ko`chirish allaqachon qabul qilingan' : 'Faqat yuborilgan ko`chirish qabul qilinadi');

    const given = new Map(dto.items.map((item) => [item.itemId, item.receivedQuantity]));
    for (const itemId of given.keys()) if (!row.items.some((item) => item.id === itemId)) throw new BadRequestException('Qatorlardan biri bu ko`chirishga tegishli emas');
    for (const item of row.items) {
      const received = given.get(item.id);
      if (received === undefined) throw new BadRequestException('Har bir qator uchun qabul qilingan sonini kiriting');
      if (received > item.quantity + 0.0005) throw new BadRequestException('Qabul qilingan soni yuborilganidan ko`p bo`lishi mumkin emas');
    }
    const epcs = [...new Set((dto.epcs || []).map(normalizeEpc).filter(Boolean) as string[])];

    await this.dataSource.transaction(async (manager) => {
      for (const item of row.items) await manager.update(TransferItem, item.id, { receivedQuantity: round3(given.get(item.id) as number) });
      if (epcs.length) await manager.update(TransferTag, { transferId: id, epc: In(epcs) }, { receivedAt: new Date() });
      await manager.update(Transfer, id, {
        status: TransferStatus.RECEIVED, receivedAt: new Date(), receivedById: user?.id || null,
        receiveNote: String(dto.note || '').trim() || null,
      });
    });
    return this.findOne(id, user);
  }

  async cancel(id: string, user: any) {
    const row = await this.entity(id);
    this.assertSender(row, user);
    if (row.status !== TransferStatus.DRAFT) throw new BadRequestException('Faqat qoralama bekor qilinadi (yuborilgan bo`lsa - avval qaytarib oling)');
    await this.repo.update(id, { status: TransferStatus.CANCELLED });
    return this.findOne(id, user);
  }

  async remove(id: string, user: any) {
    const row = await this.entity(id);
    this.assertSender(row, user);
    if (![TransferStatus.DRAFT, TransferStatus.CANCELLED].includes(row.status)) throw new BadRequestException('Yuborilgan yoki qabul qilingan ko`chirishni o`chirib bo`lmaydi');
    await this.repo.delete(id);
    return { success: true };
  }

  /** Qabul kutayotganlar soni - menyudagi belgi uchun */
  async pendingCount(user: any) {
    const branch = this.branchOf(user);
    const count = await this.repo.count({ where: { status: TransferStatus.SENT, ...(branch ? { toBranchId: branch } : {}) } });
    return { count };
  }

}
