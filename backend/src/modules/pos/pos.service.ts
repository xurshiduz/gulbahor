import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from '../materials/entities/material.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { PaymentType } from '../accounting/entities/payment-type.entity';
import { Organization } from '../administration/entities/organization.entity';
import { Contractor, ContractorType } from '../contractors/entities/contractor.entity';
import { PaymentDirection } from '../accounting/entities/payment.entity';
import { PaymentsService } from '../accounting/services/payments.service';
import { OutboundDocumentsService } from '../outbound-documents/outbound-documents.service';
import { StockRow, StockService } from '../stock/stock.service';
import { CashRegistersService } from '../cash/cash-registers.service';
import { roundMoney } from '../references/common/numeric';
import { PosSaleDto } from './dto/pos.dto';

/**
 * Kassa (POS).
 *
 * Sotuv tugaganda ikkita narsa yoziladi: tasdiqlangan chiqim hujjati
 * (chek) va uning bo'yicha pul tushumi. Shuning uchun kassadagi sotuv
 * ham qoldiqqa, ham kassa hisobiga tushadi, undan qaytarish ham
 * odatdagidek ishlaydi.
 */
@Injectable()
export class PosService {
  constructor(
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    @InjectRepository(Currency) private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(PaymentType) private readonly paymentTypeRepo: Repository<PaymentType>,
    @InjectRepository(Organization) private readonly organizationRepo: Repository<Organization>,
    @InjectRepository(Contractor) private readonly contractorRepo: Repository<Contractor>,
    private readonly sales: OutboundDocumentsService,
    private readonly payments: PaymentsService,
    private readonly stock: StockService,
    private readonly cashRegisters: CashRegistersService,
  ) {}

  /** Kassa ochilganda kerak bo'ladigan hamma narsa: xodimga ochiq kassalar, valyutalar, to'lov turlari */
  async setup(user: any) {
    const [registers, currencies, paymentTypes, organization, customers] = await Promise.all([
      this.cashRegisters.availableFor(user),
      this.currencyRepo.find({ where: { isActive: true }, order: { isBase: 'DESC', code: 'ASC' } }),
      this.paymentTypeRepo.find({ where: { isActive: true }, order: { name: 'ASC' } }),
      this.organizationRepo.find({ order: { createdAt: 'ASC' } }),
      this.contractorRepo.find({ where: { type: ContractorType.CUSTOMER, isActive: true }, order: { name: 'ASC' } }),
    ]);
    // Bugungi kurslar - valyutadagi to'lovni so'mga o'girish uchun (kassir o'zgartira oladi)
    const rates = await Promise.all(currencies.map(async (row) => [row.id, row.isBase ? 1 : (await this.payments.rateFor(row.id)).rate] as const));
    const rateOf = new Map(rates);
    return {
      cashRegisters: registers.map((row) => ({
        id: row.id, name: row.name, branchName: row.branch?.name || null,
        warehouseId: row.warehouseId, warehouseName: row.warehouse?.name || null,
      })),
      cashier: user ? { id: user.id, name: user.name } : null,
      currencies: currencies.map((row) => ({ id: row.id, code: row.code, name: row.name, symbol: row.symbol, isBase: row.isBase, rate: rateOf.get(row.id) ?? null })),
      customers: customers.map((row) => ({ id: row.id, name: row.name, phone: row.phone })),
      paymentTypes: paymentTypes.map((row) => ({ id: row.id, name: row.name })),
      shopName: organization[0]?.name || null,
    };
  }

  /**
   * Kassadagi tovarlar: narxi va tanlangan kassadagi qoldig'i bilan.
   * Narx - tovarning sotuv narxi; kiritilmagan bo'lsa oxirgi sotilgan narx.
   */
  async catalog(cashRegisterId: string, user: any) {
    const register = await this.cashRegisters.assertAccess(cashRegisterId, user);
    const warehouseId = register.warehouseId;
    const materials = await this.materialRepo.find({
      where: { isActive: true },
      relations: { unit: true, category: true, brand: true, color: true, size: true, images: true },
      order: { name: 'ASC' },
    });
    // Kassaga ombor biriktirilmagan bo'lsa qoldiq ko'rsatilmaydi (sotib ham bo'lmaydi)
    const rows: StockRow[] = warehouseId ? (await this.stock.report({ warehouseId })).rows : [];
    const stockRow = new Map(rows.map((row) => [row.materialId, row]));

    return materials.map((material) => {
      const row = stockRow.get(material.id);
      const image = material.images?.find((item) => item.isMain) || material.images?.[0];
      return {
        id: material.id,
        name: material.name,
        sku: material.sku,
        barcode: material.barcode,
        categoryId: material.categoryId,
        categoryName: material.category?.name || null,
        brandName: material.brand?.name || null,
        color: material.color ? { name: material.color.name, hex: material.color.hex } : null,
        size: material.size?.name || null,
        unit: material.unit?.shortName || null,
        imageUrl: image?.url || null,
        price: roundMoney(material.salePrice ?? (row?.salePriceKnown ? row.salePrice : 0)),
        hasPrice: material.salePrice !== null || !!row?.salePriceKnown,
        stock: row?.quantity ?? 0,
      };
    });
  }

  /** Bitta tovar - skanerlangan shtrix-kod bo'yicha */
  async scan(code: string, cashRegisterId: string, user: any) {
    const value = String(code || '').trim().toLowerCase();
    if (!value) throw new BadRequestException('Kod kiritilmagan');
    const catalog = await this.catalog(cashRegisterId, user);
    const found = catalog.find((item) => (item.barcode || '').toLowerCase() === value || (item.sku || '').toLowerCase() === value);
    if (!found) throw new NotFoundException(`"${code}" kodli tovar topilmadi`);
    return found;
  }

  /**
   * Chek chegirmasini qatorlarga taqsimlaydi: hujjat summasi kassaga
   * tushadigan pulga tiyinigacha teng bo'lsin (qaytarishda ham tovar
   * aynan to'langan narxida qaytadi).
   *
   * Narxlar nisbatan kamaytiriladi (pastga yaxlitlab), qolgan tiyinlar esa
   * donasi kam qatorlarga qo'shiladi - 1 donalik qator har qanday qoldiqni
   * oladi. Hamma qator 2+ dona va qoldiq bo'linmasa 1-2 tiyin farq qolishi mumkin.
   */
  private static spreadDiscount(items: { quantity: number; price: number }[], target: number) {
    const cents = (value: number) => Math.round(value * 100);
    const subtotal = items.reduce((sum, item) => sum + cents(item.quantity * item.price), 0);
    const targetCents = cents(target);
    if (subtotal <= 0) return;

    const unit = items.map((item) => Math.floor((cents(item.price) * targetCents) / subtotal));
    let remainder = targetCents - items.reduce((sum, item, index) => sum + Math.round(item.quantity * unit[index]), 0);

    // Donasi kam qatorlar birinchi - ularga qoldiqni aniq qo'shish oson
    const order = items.map((_, index) => index).sort((a, b) => items[a].quantity - items[b].quantity);
    for (const index of order) {
      if (remainder <= 0) break;
      const quantity = items[index].quantity;
      if (!Number.isInteger(quantity)) continue;
      const add = Math.floor(remainder / quantity);
      if (add > 0) {
        unit[index] += add;
        remainder -= add * quantity;
      }
    }
    items.forEach((item, index) => { item.price = unit[index] / 100; });
  }

  /**
   * Chekni yopish: chiqim hujjati yaratiladi, tasdiqlanadi va to'lovlar
   * pul tushumi sifatida yoziladi.
   */
  async sell(dto: PosSaleDto, user: any) {
    const userId = user?.id;
    const register = await this.cashRegisters.assertAccess(dto.cashRegisterId, user);
    if (!register.warehouseId) {
      throw new BadRequestException(`"${register.name}" kassasiga omborxona biriktirilmagan - Kassalar bo'limida belgilang`);
    }

    const lines = dto.items.map((item) => {
      const discount = item.discountPercent || 0;
      return { ...item, effectivePrice: roundMoney(item.price * (1 - discount / 100)) };
    });

    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.effectivePrice, 0));
    const discountAmount = roundMoney(dto.discountAmount || 0);
    if (discountAmount > subtotal) throw new BadRequestException('Chegirma chek summasidan katta');

    const items = lines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      price: line.effectivePrice,
    }));
    if (discountAmount > 0) PosService.spreadDiscount(items, subtotal - discountAmount);
    const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.price, 0));

    const document = await this.sales.create({
      customerId: dto.customerId || null,
      warehouseId: register.warehouseId,
      description: String(dto.description || '').trim() || null,
      items,
    } as any, userId);
    const approved = await this.sales.approve(document.id, userId);

    const receipts = [];
    for (const payment of dto.payments || []) {
      receipts.push(await this.payments.create({
        direction: PaymentDirection.INCOME,
        cashRegisterId: register.id,
        outboundDocumentId: approved.id,
        paymentTypeId: payment.paymentTypeId || null,
        currencyId: payment.currencyId,
        amount: payment.amount,
        rate: payment.rate,
        amountUzs: payment.amountUzs,
        description: `${approved.documentNumber} cheki bo'yicha`,
      } as any, user));
    }

    const paid = roundMoney(receipts.reduce((sum, receipt) => sum + receipt.amountUzs, 0));
    return {
      document: approved,
      payments: receipts,
      subtotal,
      discountAmount,
      total,
      paid,
      /** Qarz qolgan qismi (to'liq to'lansa 0) */
      debt: roundMoney(Math.max(0, total - paid)),
    };
  }
}
