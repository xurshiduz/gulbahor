import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { InboundDocument, InboundDocumentStatus, InboundDocumentType } from './entities/inbound-document.entity';
import { InboundDocumentItem } from './entities/inbound-document-item.entity';
import { CreateInboundDocumentDto, InboundItemDto, UpdateInboundDocumentDto } from './dto/inbound-documents.dto';
import { Contractor, ContractorType } from '../contractors/entities/contractor.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { Material } from '../materials/entities/material.entity';
import { OutboundDocumentStatus } from '../outbound-documents/entities/outbound-document.entity';
import { OutboundDocumentsService } from '../outbound-documents/outbound-documents.service';
import { today } from '../accounting/services/currencies.service';
import { roundMoney } from '../references/common/numeric';

const isReturnType = (type: InboundDocumentType) => type !== InboundDocumentType.PURCHASE;

/** Hujjat raqami old qo'shimchasi: XR - xarid, QT - qaytarish, AL - almashinuv */
const NUMBER_PREFIX: Record<InboundDocumentType, string> = {
  [InboundDocumentType.PURCHASE]: 'XR',
  [InboundDocumentType.RETURN]: 'QT',
  [InboundDocumentType.EXCHANGE]: 'AL',
};

type PreparedItem = Pick<InboundDocumentItem, 'materialId' | 'quantity' | 'price' | 'sourceOutboundDocumentId' | 'sourceOutboundItemId' | 'sortOrder'>;

/** Foydalanuvchidan faqat id va ism - parol xeshi kabi maydonlar hujjatga yopishib chiqmasin */
const publicUser = (user?: { id: string; name: string; username: string } | null) =>
  (user ? { id: user.id, name: user.name, username: user.username } : null);

@Injectable()
export class InboundDocumentsService {
  constructor(
    @InjectRepository(InboundDocument) private readonly documentRepo: Repository<InboundDocument>,
    @InjectRepository(InboundDocumentItem) private readonly itemRepo: Repository<InboundDocumentItem>,
    @InjectRepository(Contractor) private readonly contractorRepo: Repository<Contractor>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Currency) private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    private readonly sales: OutboundDocumentsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Ro'yxat: qatorlarsiz, jamilari bilan */
  async findAll() {
    const documents = await this.documentRepo.find({
      relations: { contractor: true, warehouse: true, currency: true, createdBy: true, items: true },
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
        contractor: true, warehouse: true, currency: true, createdBy: true, approvedBy: true,
        items: { material: { unit: true, color: true, size: true, images: true }, sourceOutboundDocument: true },
      },
      order: { items: { sortOrder: 'ASC' } },
    });
    if (!document) throw new NotFoundException('Kirim hujjati topilmadi');
    return { ...document, createdBy: publicUser(document.createdBy), approvedBy: publicUser(document.approvedBy) };
  }

  /* ------------------------------ Yaratish va o'zgartirish ----------------------------- */

  async create(dto: CreateInboundDocumentDto, userId?: string) {
    const header = await this.prepareHeader(dto.type, dto);
    const items = await this.prepareItems(dto.type, header.contractorId, dto.items || []);

    const id = await this.dataSource.transaction(async (manager) => {
      const document = await manager.save(InboundDocument, manager.create(InboundDocument, {
        ...header,
        type: dto.type,
        documentNumber: await this.nextNumber(dto.type),
        documentDate: header.documentDate || today(),
        createdById: userId || null,
      }));
      await manager.save(InboundDocumentItem, items.map((item) => manager.create(InboundDocumentItem, { ...item, documentId: document.id })));
      return document.id;
    });
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateInboundDocumentDto) {
    const document = await this.documentRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Kirim hujjati topilmadi');
    this.assertDraft(document);

    const header = await this.prepareHeader(document.type, dto, document);
    const contractorId = header.contractorId || document.contractorId;
    // Qatorlar yuborilsa to'liq almashtiriladi; yuborilmasa o'z holicha qoladi
    const items = dto.items ? await this.prepareItems(document.type, contractorId, dto.items, id) : null;

    if (!items && isReturnType(document.type) && header.contractorId && header.contractorId !== document.contractorId) {
      throw new BadRequestException('Tovar qo`shilgan qaytarish hujjatida mijozni o`zgartirib bo`lmaydi');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(InboundDocument, id, header);
      if (items) {
        await manager.delete(InboundDocumentItem, { documentId: id });
        await manager.save(InboundDocumentItem, items.map((item) => manager.create(InboundDocumentItem, { ...item, documentId: id })));
      }
    });
    return this.findOne(id);
  }

  /** Sarlavha maydonlarini tekshiradi va saqlashga tayyorlaydi */
  private async prepareHeader(type: InboundDocumentType, dto: UpdateInboundDocumentDto, existing?: InboundDocument) {
    const header: Partial<InboundDocument> = {};

    if (dto.contractorId) {
      const wanted = isReturnType(type) ? ContractorType.CUSTOMER : ContractorType.SUPPLIER;
      const contractor = await this.contractorRepo.findOne({ where: { id: dto.contractorId, type: wanted } });
      if (!contractor) throw new NotFoundException(isReturnType(type) ? 'Mijoz topilmadi' : 'Yetkazib beruvchi topilmadi');
      header.contractorId = contractor.id;
    }
    if (dto.warehouseId) {
      const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId } });
      if (!warehouse) throw new NotFoundException('Omborxona topilmadi');
      header.warehouseId = warehouse.id;
    }
    if (dto.currencyId !== undefined) {
      if (dto.currencyId && !(await this.currencyRepo.findOne({ where: { id: dto.currencyId } }))) {
        throw new NotFoundException('Valyuta topilmadi');
      }
      // Qaytarish sotuv narxida (so'mda) bo'ladi - valyuta tanlanmaydi
      header.currencyId = isReturnType(type) ? null : dto.currencyId || null;
    }
    if (dto.documentDate) {
      if (Number.isNaN(Date.parse(dto.documentDate))) throw new BadRequestException('Sana notog`ri');
      header.documentDate = dto.documentDate;
    }
    if (dto.shipmentNumber !== undefined) {
      header.shipmentNumber = isReturnType(type) ? null : String(dto.shipmentNumber || '').trim() || null;
    }
    if (dto.description !== undefined) header.description = String(dto.description || '').trim() || null;

    if (!existing && (!header.contractorId || !header.warehouseId)) {
      throw new BadRequestException('Kontragent va omborxona tanlanishi shart');
    }
    return header;
  }

  /** Qatorlarni tekshiradi: tovarlar bor, takror yo'q; qaytarishda - sotuvga mos va ortiqcha emas */
  private async prepareItems(type: InboundDocumentType, contractorId: string, items: InboundItemDto[], documentId?: string): Promise<PreparedItem[]> {
    const materialIds = [...new Set(items.map((item) => item.materialId))];
    const materials = materialIds.length ? await this.materialRepo.findBy({ id: In(materialIds) }) : [];
    const materialName = new Map(materials.map((material) => [material.id, material.name]));
    const missing = materialIds.find((materialId) => !materialName.has(materialId));
    if (missing) throw new NotFoundException('Tanlangan tovarlardan biri topilmadi');

    if (!isReturnType(type)) {
      if (materialIds.length !== items.length) {
        throw new BadRequestException('Bitta tovar hujjatda ikki marta kiritilgan - sonini bitta qatorda yozing');
      }
      return items.map((item, index) => ({
        materialId: item.materialId,
        quantity: item.quantity,
        price: item.price ?? 0,
        sourceOutboundDocumentId: null,
        sourceOutboundItemId: null,
        sortOrder: index + 1,
      }));
    }

    // Qaytarish / almashinuv: har bir qator sotuv hujjatining qatoriga bog'langan bo'lishi shart
    const sourceIds = items.map((item) => item.sourceOutboundItemId);
    if (sourceIds.some((sourceId) => !sourceId)) {
      throw new BadRequestException('Qaytarish va almashinuvda tovar faqat sotuv (chiqim) hujjatidan tanlanadi');
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new BadRequestException('Sotuv hujjatining bitta qatori ikki marta tanlangan');
    }

    const soldItems = await this.sales.findItemsWithDocument(sourceIds);
    const sold = new Map(soldItems.map((item) => [item.id, item]));
    const returned = await this.sales.returnedQuantities(sourceIds, documentId);

    return items.map((item, index) => {
      const source = sold.get(item.sourceOutboundItemId);
      const name = materialName.get(item.materialId);
      if (!source || source.materialId !== item.materialId) {
        throw new BadRequestException(`"${name}" tanlangan sotuv hujjatida yo'q`);
      }
      if (source.document.status !== OutboundDocumentStatus.APPROVED) {
        throw new BadRequestException(`${source.document.documentNumber} sotuv hujjati tasdiqlanmagan`);
      }
      if (source.document.customerId && source.document.customerId !== contractorId) {
        throw new BadRequestException(`${source.document.documentNumber} sotuv hujjati boshqa mijozga tegishli`);
      }
      const returnable = Number((source.quantity - (returned.get(source.id) || 0)).toFixed(3));
      if (item.quantity > returnable) {
        throw new BadRequestException(`"${name}": eng ko'pi ${returnable} ta qaytarish mumkin (sotilgan ${source.quantity})`);
      }
      return {
        materialId: item.materialId,
        quantity: item.quantity,
        // Narx foydalanuvchidan olinmaydi - tovar sotilgan narxida qaytadi
        price: source.price,
        sourceOutboundDocumentId: source.documentId,
        sourceOutboundItemId: source.id,
        sortOrder: index + 1,
      };
    });
  }

  /** Navbatdagi raqam: XR26-000001 (tur, yil, tartib). Raqam band bo'lsa keyingisi olinadi */
  private async nextNumber(type: InboundDocumentType) {
    const prefix = `${NUMBER_PREFIX[type]}${today().slice(2, 4)}-`;
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

  private assertDraft(document: InboundDocument) {
    if (document.status !== InboundDocumentStatus.DRAFT) {
      throw new BadRequestException('Tasdiqlangan hujjatni o`zgartirib bo`lmaydi - avval qoralamaga qaytaring');
    }
  }

  /* ---------------------------------- Holat ---------------------------------- */

  /** Tasdiqlash: hujjat qulflanadi. Qaytarishda sonlar yana bir bor tekshiriladi */
  async approve(id: string, userId?: string) {
    const document = await this.documentRepo.findOne({ where: { id }, relations: { items: true } });
    if (!document) throw new NotFoundException('Kirim hujjati topilmadi');
    if (document.status === InboundDocumentStatus.APPROVED) return this.findOne(id);
    if (!document.items.length) throw new BadRequestException('Tovar qo`shilmagan hujjatni tasdiqlab bo`lmaydi');

    if (isReturnType(document.type)) {
      // Hujjat qoralamada turgan vaqtda boshqa qaytarish kiritilgan bo'lishi mumkin
      await this.prepareItems(document.type, document.contractorId, document.items.map((item) => ({
        materialId: item.materialId, quantity: item.quantity, sourceOutboundItemId: item.sourceOutboundItemId,
      })), id);
    }

    await this.documentRepo.update(id, { status: InboundDocumentStatus.APPROVED, approvedById: userId || null, approvedAt: new Date() });
    return this.findOne(id);
  }

  /** Qoralamaga qaytarish - xato topilsa tuzatish uchun */
  async revert(id: string) {
    const document = await this.documentRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Kirim hujjati topilmadi');
    if (document.status === InboundDocumentStatus.DRAFT) return this.findOne(id);

    await this.documentRepo.update(id, { status: InboundDocumentStatus.DRAFT, approvedById: null, approvedAt: null });
    return this.findOne(id);
  }

  async remove(id: string) {
    const document = await this.documentRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Kirim hujjati topilmadi');
    if (document.status !== InboundDocumentStatus.DRAFT) {
      throw new BadRequestException('Tasdiqlangan hujjatni o`chirib bo`lmaydi - avval qoralamaga qaytaring');
    }
    await this.documentRepo.remove(document);
    return { success: true };
  }
}
