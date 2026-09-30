import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { OutboundDocument, OutboundDocumentStatus } from './entities/outbound-document.entity';
import { OutboundDocumentItem } from './entities/outbound-document-item.entity';
import { InboundDocumentItem } from '../inbound-documents/entities/inbound-document-item.entity';
import { Contractor, ContractorType } from '../contractors/entities/contractor.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { CreateOutboundDocumentDto, OutboundItemDto, UpdateOutboundDocumentDto } from './dto/outbound-documents.dto';
import { today } from '../accounting/services/currencies.service';
import { roundMoney } from '../references/common/numeric';

/** Qaytarish ro'yxatida bir yo'la ko'rsatiladigan sotuvlar soni */
const FOR_RETURN_LIMIT = 100;

/** Hujjat raqami old qo'shimchasi: CH26-000001 */
const NUMBER_PREFIX = 'CH';

/** Foydalanuvchidan faqat id va ism - parol xeshi kabi maydonlar hujjatga yopishib chiqmasin */
const publicUser = (user?: { id: string; name: string; username: string } | null) =>
  (user ? { id: user.id, name: user.name, username: user.username } : null);

/**
 * Chiqim (sotuv) hujjatlari: yaratish, tasdiqlash va qaytarish uchun qidirish.
 *
 * Kirimdagi "Qaytarish" va "Almashinuv" tovarni shu yerdan oladi:
 * chek raqami bo'yicha yoki mijozning sotuvlari ro'yxatidan. Har bir
 * qatorda qancha qaytarish mumkinligi hisoblanadi: sotilgan soni minus
 * avval qaytarilgani.
 */
@Injectable()
export class OutboundDocumentsService {
  constructor(
    @InjectRepository(OutboundDocument) private readonly documentRepo: Repository<OutboundDocument>,
    @InjectRepository(OutboundDocumentItem) private readonly itemRepo: Repository<OutboundDocumentItem>,
    @InjectRepository(InboundDocumentItem) private readonly inboundItemRepo: Repository<InboundDocumentItem>,
    @InjectRepository(Contractor) private readonly contractorRepo: Repository<Contractor>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    private readonly dataSource: DataSource,
  ) {}

  /* ---------------------------------- Hujjatlar --------------------------------- */

  /** Ro'yxat: qatorlarsiz, jamilari bilan */
  async findAll() {
    const documents = await this.documentRepo.find({
      relations: { customer: true, warehouse: true, createdBy: true, items: true },
      order: { documentDate: 'DESC', createdAt: 'DESC' },
    });
    return documents.map(({ items, ...document }) => ({
      ...document,
      createdBy: publicUser(document.createdBy),
      itemsCount: items.length,
      totalQuantity: Number(items.reduce((sum, item) => sum + item.quantity, 0).toFixed(3)),
      totalAmount: roundMoney(items.reduce((sum, item) => sum + item.quantity * item.price, 0)),
    }));
  }

  async findOne(id: string) {
    const document = await this.documentRepo.findOne({
      where: { id },
      relations: {
        customer: true, warehouse: true, createdBy: true, approvedBy: true,
        items: { material: { unit: true, color: true, size: true, images: true } },
      },
      order: { items: { sortOrder: 'ASC' } },
    });
    if (!document) throw new NotFoundException('Chiqim hujjati topilmadi');

    // Har bir qatordan qancha qaytarilgani - formada ko'rsatiladi
    const returned = await this.returnedQuantities(document.items.map((item) => item.id));
    return {
      ...document,
      items: document.items.map((item) => ({ ...item, returned: returned.get(item.id) || 0 })),
      createdBy: publicUser(document.createdBy),
      approvedBy: publicUser(document.approvedBy),
    };
  }

  async create(dto: CreateOutboundDocumentDto, userId?: string) {
    const header = await this.prepareHeader(dto);
    const items = await this.prepareItems(dto.items || []);

    const id = await this.dataSource.transaction(async (manager) => {
      const document = await manager.save(OutboundDocument, manager.create(OutboundDocument, {
        ...header,
        documentNumber: await this.nextNumber(),
        documentDate: header.documentDate || today(),
        createdById: userId || null,
      }));
      await manager.save(OutboundDocumentItem, items.map((item) => manager.create(OutboundDocumentItem, { ...item, documentId: document.id })));
      return document.id;
    });
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateOutboundDocumentDto) {
    const document = await this.documentRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Chiqim hujjati topilmadi');
    if (document.status !== OutboundDocumentStatus.DRAFT) {
      throw new BadRequestException('Tasdiqlangan hujjatni o`zgartirib bo`lmaydi - avval qoralamaga qaytaring');
    }

    const header = await this.prepareHeader(dto, document);
    // Qatorlar yuborilsa to'liq almashtiriladi; yuborilmasa o'z holicha qoladi
    const items = dto.items ? await this.prepareItems(dto.items) : null;

    await this.dataSource.transaction(async (manager) => {
      if (Object.keys(header).length) await manager.update(OutboundDocument, id, header);
      if (items) {
        await manager.delete(OutboundDocumentItem, { documentId: id });
        await manager.save(OutboundDocumentItem, items.map((item) => manager.create(OutboundDocumentItem, { ...item, documentId: id })));
      }
    });
    return this.findOne(id);
  }

  private async prepareHeader(dto: UpdateOutboundDocumentDto, existing?: OutboundDocument) {
    const header: Partial<OutboundDocument> = {};

    if (dto.customerId) {
      const customer = await this.contractorRepo.findOne({ where: { id: dto.customerId, type: ContractorType.CUSTOMER } });
      if (!customer) throw new NotFoundException('Mijoz topilmadi');
      header.customerId = customer.id;
    }
    if (dto.warehouseId) {
      const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId } });
      if (!warehouse) throw new NotFoundException('Omborxona topilmadi');
      header.warehouseId = warehouse.id;
    }
    if (dto.documentDate) {
      if (Number.isNaN(Date.parse(dto.documentDate))) throw new BadRequestException('Sana notog`ri');
      header.documentDate = dto.documentDate;
    }
    if (dto.description !== undefined) header.description = String(dto.description || '').trim() || null;

    if (!existing && (!header.customerId || !header.warehouseId)) {
      throw new BadRequestException('Mijoz va omborxona tanlanishi shart');
    }
    return header;
  }

  /** Qatorlarni tekshiradi: tovarlar bor, takror yo'q */
  private async prepareItems(items: OutboundItemDto[]) {
    const materialIds = [...new Set(items.map((item) => item.materialId))];
    const found = materialIds.length ? await this.materialRepo.findBy({ id: In(materialIds) }) : [];
    if (found.length !== materialIds.length) throw new NotFoundException('Tanlangan tovarlardan biri topilmadi');
    if (materialIds.length !== items.length) {
      throw new BadRequestException('Bitta tovar hujjatda ikki marta kiritilgan - sonini bitta qatorda yozing');
    }
    return items.map((item, index) => ({
      materialId: item.materialId,
      quantity: item.quantity,
      price: item.price ?? 0,
      sortOrder: index + 1,
    }));
  }

  /** Navbatdagi raqam: CH26-000001 (yil, tartib). Raqam band bo'lsa keyingisi olinadi */
  private async nextNumber() {
    const prefix = `${NUMBER_PREFIX}${today().slice(2, 4)}-`;
    const last = await this.documentRepo
      .createQueryBuilder('doc')
      .where('doc.documentNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('doc.documentNumber', 'DESC')
      .getOne();

    let next = (last ? parseInt(last.documentNumber.slice(prefix.length), 10) || 0 : 0) + 1;
    for (;;) {
      const candidate = `${prefix}${String(next).padStart(6, '0')}`;
      if (!(await this.documentRepo.findOne({ where: { documentNumber: candidate } }))) return candidate;
      next += 1;
    }
  }

  /** Tasdiqlash: hujjat qulflanadi va undan qaytarish qilish mumkin bo'ladi */
  async approve(id: string, userId?: string) {
    const document = await this.documentRepo.findOne({ where: { id }, relations: { items: true } });
    if (!document) throw new NotFoundException('Chiqim hujjati topilmadi');
    if (document.status === OutboundDocumentStatus.APPROVED) return this.findOne(id);
    if (!document.items.length) throw new BadRequestException('Tovar qo`shilmagan hujjatni tasdiqlab bo`lmaydi');
    if (!document.customerId || !document.warehouseId) throw new BadRequestException('Mijoz va omborxona tanlanishi shart');

    await this.documentRepo.update(id, { status: OutboundDocumentStatus.APPROVED, approvedById: userId || null, approvedAt: new Date() });
    return this.findOne(id);
  }

  /** Shu hujjatdan qaytarish (qoralama bo'lsa ham) qilinganmi */
  private async hasReturns(id: string) {
    return (await this.inboundItemRepo.count({ where: { sourceOutboundDocumentId: id } })) > 0;
  }

  /** Qoralamaga qaytarish. Hujjatdan qaytarish qilingan bo'lsa mumkin emas - qaytarish sotuv qatoriga bog'langan */
  async revert(id: string) {
    const document = await this.documentRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Chiqim hujjati topilmadi');
    if (document.status === OutboundDocumentStatus.DRAFT) return this.findOne(id);
    if (await this.hasReturns(id)) {
      throw new BadRequestException('Bu hujjat bo`yicha qaytarish qilingan - uni qoralamaga qaytarib bo`lmaydi');
    }

    await this.documentRepo.update(id, { status: OutboundDocumentStatus.DRAFT, approvedById: null, approvedAt: null });
    return this.findOne(id);
  }

  async remove(id: string) {
    const document = await this.documentRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Chiqim hujjati topilmadi');
    if (document.status !== OutboundDocumentStatus.DRAFT) {
      throw new BadRequestException('Tasdiqlangan hujjatni o`chirib bo`lmaydi - avval qoralamaga qaytaring');
    }
    if (await this.hasReturns(id)) throw new BadRequestException('Bu hujjat bo`yicha qaytarish qilingan - uni o`chirib bo`lmaydi');
    await this.documentRepo.remove(document);
    return { success: true };
  }

  /* ----------------------------- Qaytarish uchun qidiruv ----------------------------- */

  /**
   * Sotuv qatorlari bo'yicha avval qaytarilgan son: { sotuvQatoriId: soni }.
   * Qoralama qaytarishlar ham hisobga kiradi - bitta tovar ikki hujjatda
   * ikki marta qaytarilmasin. `excludeInboundDocumentId` - tahrirlanayotgan
   * hujjatning o'zi hisobdan chiqariladi.
   */
  async returnedQuantities(outboundItemIds: string[], excludeInboundDocumentId?: string) {
    const result = new Map<string, number>();
    if (!outboundItemIds.length) return result;

    const qb = this.inboundItemRepo
      .createQueryBuilder('item')
      .select('item.sourceOutboundItemId', 'itemId')
      .addSelect('SUM(item.quantity)', 'returned')
      .where('item.sourceOutboundItemId IN (:...ids)', { ids: outboundItemIds })
      .groupBy('item.sourceOutboundItemId');
    if (excludeInboundDocumentId) qb.andWhere('item.documentId != :exclude', { exclude: excludeInboundDocumentId });

    for (const row of await qb.getRawMany()) result.set(row.itemId, Number(row.returned));
    return result;
  }

  /** Hujjat qatorlari qaytarish mumkin bo'lgan soni bilan */
  private async withReturnable(document: OutboundDocument, excludeInboundDocumentId?: string) {
    const returned = await this.returnedQuantities(document.items.map((item) => item.id), excludeInboundDocumentId);
    return {
      id: document.id,
      documentNumber: document.documentNumber,
      documentDate: document.documentDate,
      customer: document.customer ? { id: document.customer.id, name: document.customer.name, phone: document.customer.phone } : null,
      items: document.items.map((item) => {
        const already = returned.get(item.id) || 0;
        return {
          id: item.id,
          materialId: item.materialId,
          material: item.material,
          quantity: item.quantity,
          price: item.price,
          returned: already,
          returnable: Math.max(0, Number((item.quantity - already).toFixed(3))),
        };
      }),
    };
  }

  /** Chek (hujjat) raqami bo'yicha sotuv - qaytarish oynasi uchun */
  async findByNumber(documentNumber: string, excludeInboundDocumentId?: string) {
    const number = String(documentNumber || '').trim();
    if (!number) throw new BadRequestException('Chek raqami kiritilmagan');

    const document = await this.documentRepo
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.customer', 'customer')
      .leftJoinAndSelect('doc.items', 'item')
      .leftJoinAndSelect('item.material', 'material')
      .leftJoinAndSelect('material.unit', 'unit')
      .leftJoinAndSelect('material.color', 'color')
      .leftJoinAndSelect('material.size', 'size')
      .where('LOWER(doc.documentNumber) = :number', { number: number.toLowerCase() })
      .getOne();

    if (!document) throw new NotFoundException(`"${number}" raqamli sotuv hujjati topilmadi`);
    if (document.status !== OutboundDocumentStatus.APPROVED) {
      throw new BadRequestException('Bu sotuv hujjati hali tasdiqlanmagan - undan qaytarish qilinmaydi');
    }
    return this.withReturnable(document, excludeInboundDocumentId);
  }

  /**
   * Mijozning sotuvlari - raqamini bilmasa shu ro'yxatdan tanlanadi.
   * `q` - tovar nomi, artikuli yoki shtrix-kodi: o'sha tovar bor hujjatlar qoladi.
   */
  async findForReturn(customerId: string, q?: string) {
    if (!customerId) throw new BadRequestException('Mijoz tanlanmagan');

    const qb = this.documentRepo
      .createQueryBuilder('doc')
      .select('doc.id')
      .where('doc.customerId = :customerId AND doc.status = :status', { customerId, status: OutboundDocumentStatus.APPROVED });

    const query = String(q || '').trim().toLowerCase();
    if (query) {
      qb.innerJoin('doc.items', 'item').innerJoin('item.material', 'material').andWhere(
        '(LOWER(material.name) LIKE :like OR LOWER(material.barcode) = :exact OR LOWER(material.sku) = :exact OR LOWER(doc.documentNumber) LIKE :like)',
        { like: `%${query}%`, exact: query },
      );
    }

    const ids = [...new Set((await qb.getMany()).map((doc) => doc.id))];
    if (!ids.length) return [];

    const documents = await this.documentRepo.find({
      where: { id: In(ids) },
      relations: { items: { material: true } },
      order: { documentDate: 'DESC', documentNumber: 'DESC' },
      take: FOR_RETURN_LIMIT,
    });
    const returned = await this.returnedQuantities(documents.flatMap((doc) => doc.items.map((item) => item.id)));

    return documents.map((doc) => {
      const returnable = doc.items.reduce((sum, item) => sum + Math.max(0, item.quantity - (returned.get(item.id) || 0)), 0);
      return {
        id: doc.id,
        documentNumber: doc.documentNumber,
        documentDate: doc.documentDate,
        itemsCount: doc.items.length,
        totalAmount: doc.items.reduce((sum, item) => sum + item.quantity * item.price, 0),
        // Qaytarish mumkin bo'lgan tovar qolmagan hujjat ham ko'rinadi, lekin belgilab qo'yiladi
        returnable: Number(returnable.toFixed(3)),
        materials: doc.items.slice(0, 3).map((item) => item.material?.name).filter(Boolean),
      };
    });
  }

  /** Kirim hujjatini tekshirish uchun: sotuv qatorlari hujjati bilan */
  findItemsWithDocument(itemIds: string[]) {
    if (!itemIds.length) return Promise.resolve([] as OutboundDocumentItem[]);
    return this.itemRepo.find({ where: { id: In(itemIds) }, relations: { document: true } });
  }
}
