import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OutboundDocument, OutboundDocumentStatus } from './entities/outbound-document.entity';
import { OutboundDocumentItem } from './entities/outbound-document-item.entity';
import { InboundDocumentItem } from '../inbound-documents/entities/inbound-document-item.entity';

/** Qaytarish ro'yxatida bir yo'la ko'rsatiladigan sotuvlar soni */
const FOR_RETURN_LIMIT = 100;

/**
 * Sotuv (chiqim) hujjatlarini qaytarish uchun qidirish.
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
  ) {}

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
