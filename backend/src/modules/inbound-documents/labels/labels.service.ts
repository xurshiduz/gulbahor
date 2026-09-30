import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Socket } from 'net';
import { In, Repository } from 'typeorm';
import { InboundDocument } from '../entities/inbound-document.entity';
import { InboundDocumentItem } from '../entities/inbound-document-item.entity';
import { RfidTag } from '../entities/rfid-tag.entity';
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, LabelData, buildLabelZpl } from './zpl';

/** Bir martada chop etiladigan etiketkalar chegarasi - xato bilan minglab yuborilmasin */
const MAX_LABELS_PER_PRINT = 1000;
const PRINTER_TIMEOUT_MS = 8000;

/**
 * EPC boshi: "GUL" so'zining ASCII kodi (47 55 4C). Qolgan 18 hex belgi -
 * belgining ketma-ket raqami. .env da RFID_EPC_PREFIX bilan almashtiriladi
 * (masalan kompaniyaning GS1 prefiksi asosidagi bosh qism).
 */
const DEFAULT_EPC_PREFIX = '47554C';

export interface LabelRequestItem {
  materialId: string;
  count: number;
}

export interface LabelOptions {
  size?: string;
  /** Faqat hali chop etilmagan donalar (hujjatga tovar qo'shilgandan keyin qolganini chiqarish uchun) */
  onlyNew?: boolean;
  /** false - RFID chipsiz oddiy etiketka: chipga yozish buyrug'i qo'shilmaydi */
  rfid?: boolean;
}

@Injectable()
export class LabelsService {
  private readonly logger = new Logger(LabelsService.name);

  constructor(
    @InjectRepository(InboundDocument) private readonly documentRepo: Repository<InboundDocument>,
    @InjectRepository(InboundDocumentItem) private readonly itemRepo: Repository<InboundDocumentItem>,
    @InjectRepository(RfidTag) private readonly tagRepo: Repository<RfidTag>,
  ) {}

  /** Printer manzili .env dan: LABEL_PRINTER_HOST, LABEL_PRINTER_PORT (odatda 9100) */
  private printer() {
    const host = process.env.LABEL_PRINTER_HOST?.trim() || '';
    const port = Number(process.env.LABEL_PRINTER_PORT) || 9100;
    return { host, port, configured: !!host };
  }

  private epcPrefix() {
    const prefix = (process.env.RFID_EPC_PREFIX || DEFAULT_EPC_PREFIX).trim().toUpperCase();
    return /^[0-9A-F]{2,12}$/.test(prefix) && prefix.length % 2 === 0 ? prefix : DEFAULT_EPC_PREFIX;
  }

  /** Ketma-ket raqamdan 24 belgili EPC: prefiks + raqam (hex, nol bilan to'ldirilgan) */
  private epcFor(id: string) {
    const prefix = this.epcPrefix();
    return prefix + BigInt(id).toString(16).toUpperCase().padStart(24 - prefix.length, '0');
  }

  /** Bitta tovardan nechta etiketka kerak: butun dona - o'shancha, kasrli son (metr, kg) - bitta */
  private static unitsOf(quantity: number) {
    return Number.isInteger(quantity) ? quantity : 1;
  }

  /** Hujjat bo'yicha holat: har tovar uchun nechta etiketka kerak va nechtasi chop etilgan */
  async status(documentId: string) {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Kirim hujjati topilmadi');

    const units = await this.unitsByMaterial(documentId);
    const printed = await this.tagRepo
      .createQueryBuilder('tag')
      .select('tag.materialId', 'materialId')
      .addSelect('COUNT(*) FILTER (WHERE tag.printCount > 0)', 'printed')
      .where('tag.inboundDocumentId = :documentId', { documentId })
      .groupBy('tag.materialId')
      .getRawMany();
    const printedBy = new Map(printed.map((row) => [row.materialId, Number(row.printed)]));

    const printer = this.printer();
    return {
      printer: { configured: printer.configured, address: printer.configured ? `${printer.host}:${printer.port}` : null },
      sizes: Object.keys(LABEL_SIZES),
      defaultSize: DEFAULT_LABEL_SIZE,
      items: [...units].map(([materialId, row]) => ({
        materialId,
        quantity: row.quantity,
        units: row.units,
        printed: Math.min(printedBy.get(materialId) || 0, row.units),
      })),
    };
  }

  /**
   * Tovar bo'yicha donalar soni. Qaytarishda bitta tovar bir necha qatorda
   * (turli cheklardan) kelishi mumkin - ular qo'shiladi.
   */
  private async unitsByMaterial(documentId: string, materialIds?: string[]) {
    const items = await this.itemRepo.find({
      where: { documentId, ...(materialIds ? { materialId: In(materialIds) } : {}) },
      relations: { material: { color: true, size: true, brand: true } },
      order: { sortOrder: 'ASC' },
    });
    const result = new Map<string, { material: InboundDocumentItem['material']; quantity: number; units: number }>();
    for (const item of items) {
      const row = result.get(item.materialId) || { material: item.material, quantity: 0, units: 0 };
      row.quantity += item.quantity;
      row.units += LabelsService.unitsOf(item.quantity);
      result.set(item.materialId, row);
    }
    return result;
  }

  /**
   * Etiketkalarni tayyorlaydi: har bir dona uchun RFID belgisi (yo'q bo'lsa
   * yaratiladi, bor bo'lsa o'sha kod qayta ishlatiladi) va ZPL matni.
   * Qayta chop etishda kod o'zgarmaydi - yirtilgan etiketka o'rniga
   * aynan shu dona uchun yangisi chiqadi.
   */
  private async prepare(documentId: string, requested: LabelRequestItem[], options: LabelOptions = {}) {
    const size = LABEL_SIZES[options.size || DEFAULT_LABEL_SIZE];
    if (!size) throw new BadRequestException('Etiketka o`lchami notog`ri');

    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Kirim hujjati topilmadi');

    const wanted = requested.filter((row) => row.count > 0);
    if (!wanted.length) throw new BadRequestException('Chop etiladigan etiketka tanlanmagan');
    const total = wanted.reduce((sum, row) => sum + row.count, 0);
    if (total > MAX_LABELS_PER_PRINT) {
      throw new BadRequestException(`Bir martada eng ko'pi ${MAX_LABELS_PER_PRINT} ta etiketka chop etiladi`);
    }

    const byMaterial = await this.unitsByMaterial(documentId, wanted.map((row) => row.materialId));

    const tags: RfidTag[] = [];
    const labels: (LabelData & { materialId: string })[] = [];

    for (const { materialId, count } of wanted) {
      const item = byMaterial.get(materialId);
      if (!item) throw new BadRequestException('Tanlangan tovar hujjatda yo`q - hujjatni saqlab, qayta urinib ko`ring');
      const units = item.units;
      if (count > units) {
        throw new BadRequestException(`"${item.material.name}": hujjatda ${units} dona - undan ko'p etiketka chop etilmaydi`);
      }

      let unitTags = await this.ensureTags(documentId, materialId, count);
      if (options.onlyNew) unitTags = unitTags.filter((tag) => !tag.printCount);
      const details = [item.material.size?.name, item.material.color?.name?.uz, item.material.brand?.name].filter(Boolean).join(' · ');
      for (const tag of unitTags) {
        tags.push(tag);
        labels.push({
          materialId,
          name: item.material.name,
          details,
          sku: item.material.sku,
          barcode: item.material.barcode,
          epc: tag.epc,
          unit: `${tag.unitNo}/${units}`,
        });
      }
    }

    if (!labels.length) throw new BadRequestException('Tanlangan etiketkalarning hammasi allaqachon chop etilgan');
    const withRfid = options.rfid !== false;
    return { document, tags, labels, zpl: labels.map((label) => buildLabelZpl(label, size, withRfid)).join('\n') };
  }

  /** Hujjatdagi tovarning 1..count donalari uchun belgilar; yetishmaganlari yaratiladi */
  private async ensureTags(documentId: string, materialId: string, count: number) {
    const existing = await this.tagRepo.find({ where: { inboundDocumentId: documentId, materialId }, order: { unitNo: 'ASC' } });
    const have = new Set(existing.map((tag) => tag.unitNo));
    const missing: number[] = [];
    for (let unitNo = 1; unitNo <= count; unitNo++) if (!have.has(unitNo)) missing.push(unitNo);

    if (missing.length) {
      const created = await this.tagRepo.save(
        missing.map((unitNo) => this.tagRepo.create({ inboundDocumentId: documentId, materialId, unitNo })),
      );
      // EPC ketma-ket raqamdan yasaladi, u esa faqat saqlangandan keyin ma'lum bo'ladi
      for (const tag of created) {
        tag.epc = this.epcFor(tag.id);
        await this.tagRepo.update(tag.id, { epc: tag.epc });
      }
      existing.push(...created);
    }
    return existing.filter((tag) => tag.unitNo <= count).sort((a, b) => a.unitNo - b.unitNo);
  }

  private async markPrinted(tags: RfidTag[]) {
    if (!tags.length) return;
    await this.tagRepo
      .createQueryBuilder()
      .update(RfidTag)
      .set({ printCount: () => '"printCount" + 1', lastPrintedAt: new Date() })
      .whereInIds(tags.map((tag) => tag.id))
      .execute();
  }

  /** ZPL matnini qaytaradi - printerga tarmoq orqali ulanib bo'lmaganda faylga saqlab, qo'lda yuborish uchun */
  async download(documentId: string, requested: LabelRequestItem[], options?: LabelOptions) {
    const { document, tags, labels, zpl } = await this.prepare(documentId, requested, options);
    await this.markPrinted(tags);
    return { fileName: `etiketka_${document.documentNumber}.zpl`, count: labels.length, zpl };
  }

  /** Etiketkalarni printerga yuboradi (tarmoq, 9100-port). Printer har birini bosadi va chipini yozadi */
  async print(documentId: string, requested: LabelRequestItem[], options?: LabelOptions) {
    const printer = this.printer();
    if (!printer.configured) {
      throw new BadRequestException('Etiketka printeri sozlanmagan: backend .env fayliga LABEL_PRINTER_HOST yozing yoki ZPL faylni yuklab oling');
    }
    const { document, tags, labels, zpl } = await this.prepare(documentId, requested, options);

    try {
      await this.send(printer.host, printer.port, zpl);
    } catch (error: any) {
      this.logger.error(`Printerga yuborilmadi (${printer.host}:${printer.port}): ${error?.message}`);
      throw new ServiceUnavailableException(`Printerga ulanib bo'lmadi (${printer.host}:${printer.port}). Printer yoqilgani va tarmoqqa ulangani tekshiring.`);
    }

    await this.markPrinted(tags);
    this.logger.log(`${document.documentNumber}: ${labels.length} ta etiketka printerga yuborildi`);
    return { sent: labels.length, printer: `${printer.host}:${printer.port}` };
  }

  /** RFID kodi bo'yicha tovarni topadi (skaner o'qigan EPC -> qaysi tovar, qaysi kirim) */
  async findByEpc(epc: string) {
    const tag = await this.tagRepo.findOne({
      where: { epc: String(epc || '').trim().toUpperCase() },
      relations: { material: { unit: true, color: true, size: true, brand: true }, inboundDocument: true },
    });
    if (!tag) throw new NotFoundException('Bunday RFID kod topilmadi');
    return {
      epc: tag.epc,
      unitNo: tag.unitNo,
      printCount: tag.printCount,
      lastPrintedAt: tag.lastPrintedAt,
      material: tag.material,
      inboundDocument: tag.inboundDocument
        ? { id: tag.inboundDocument.id, documentNumber: tag.inboundDocument.documentNumber, documentDate: tag.inboundDocument.documentDate }
        : null,
    };
  }

  /** ZPL ni printerga xom ko'rinishda yuboradi */
  private send(host: string, port: number, data: string) {
    return new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      let done = false;
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        socket.destroy();
        if (error) reject(error); else resolve();
      };
      socket.setTimeout(PRINTER_TIMEOUT_MS);
      socket.once('timeout', () => finish(new Error('vaqt tugadi')));
      socket.once('error', (error) => finish(error));
      socket.connect(port, host, () => {
        socket.write(data, 'utf8', (error) => {
          if (error) return finish(error);
          socket.end(() => finish());
        });
      });
    });
  }
}
