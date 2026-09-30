import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { PROVIDERS } from './providers';
import { StockService } from '../stock/stock.service';
import { PushResult, StockItem, ozon, uzumMarket, wildberries } from './clients/marketplace-clients';

/**
 * Marketpleyslarga qoldiq yuborish.
 *
 * Tanlangan omborlarimizdagi qoldiq (tasdiqlangan hujjatlardan) yig'iladi,
 * zaxira ayiriladi va marketpleysdagi omborga yuboriladi. Qo'lda ("Hozir
 * yuborish") yoki avtomatik - har N daqiqada.
 */
@Injectable()
export class MarketplaceSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketplaceSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  /** Bir provayder bir vaqtda ikki marta yuborilmasin */
  private readonly running = new Set<string>();

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly stock: StockService,
  ) {}

  onModuleInit() {
    // Har daqiqada: avtomatik yuborish vaqti kelgan marketpleyslar
    this.timer = setInterval(() => this.autoSync().catch((error) => this.logger.error(error?.message)), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async autoSync() {
    const list = await this.integrations.list();
    for (const row of list) {
      const minutes = Number(row.options?.autoSyncMinutes || 0);
      if (row.kind !== 'MARKETPLACE' || !row.isEnabled || minutes <= 0) continue;
      const last = row.lastSyncAt ? new Date(row.lastSyncAt).getTime() : 0;
      if (Date.now() - last < minutes * 60_000) continue;
      await this.sync(row.code, 'auto').catch(() => { /* natija jurnalga yozildi */ });
    }
  }

  /** Marketpleysdagi omborlar (Uzum - do'konlar) - sozlamada tanlash uchun */
  async warehouses(code: string) {
    const { def, credentials: c } = await this.integrations.config(code, false);
    try {
      if (def.api === 'wildberries') return await wildberries.warehouses(c.token);
      if (def.api === 'ozon') return await ozon.warehouses(c.clientId, c.apiKey);
      if (def.api === 'uzum-market') return await uzumMarket.warehouses(c.token);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Omborlarni olib bo`lmadi');
    }
    throw new BadRequestException('Bu marketpleys integratsiyasi emas');
  }

  /** Yuboriladigan qoldiq: tanlangan omborlarimiz bo'yicha, zaxirasiz, butun dona */
  async preview(code: string) {
    const { setting } = await this.integrations.config(code, false);
    const warehouseIds: string[] = setting.options?.warehouseIds || [];
    if (!warehouseIds.length) throw new BadRequestException('Qoldig`i yuboriladigan omborlar tanlanmagan');
    const safety = Number(setting.options?.safetyStock || 0);

    const { rows } = await this.stock.report({});
    const wanted = new Set(warehouseIds);
    const items: StockItem[] = [];
    for (const row of rows) {
      const inScope = row.warehouses.filter((place) => place.warehouseId && wanted.has(place.warehouseId)).reduce((sum, place) => sum + place.quantity, 0);
      // Marketpleysga manfiy yoki kasrli son yuborilmaydi
      const amount = Math.max(0, Math.floor(inScope) - safety);
      const material = row.material;
      if (!material) continue;
      items.push({ materialId: row.materialId, name: material.name, sku: material.sku || null, barcode: material.barcode || null, amount });
    }
    return items;
  }

  async sync(code: string, trigger: 'manual' | 'auto' = 'manual') {
    const { def, setting, credentials: c } = await this.integrations.config(code);
    if (def.kind !== 'MARKETPLACE') throw new BadRequestException('Bu marketpleys integratsiyasi emas');
    if (this.running.has(def.code)) throw new BadRequestException('Qoldiq hozir yuborilmoqda - biroz kuting');
    this.running.add(def.code);

    try {
      const items = await this.preview(def.code);
      const target = String(setting.options?.targetWarehouseId || c.shopId || '');
      let result: PushResult;
      if (def.api === 'wildberries') result = await wildberries.push(c.token, target, items);
      else if (def.api === 'ozon') result = await ozon.push(c.clientId, c.apiKey, target, items, setting.options?.matchBy === 'barcode' ? 'barcode' : 'sku');
      else result = await uzumMarket.push(c.token, target || c.shopId, items);

      const status = result.rejected.length ? (result.sent ? 'PARTIAL' : 'ERROR') : 'OK';
      const message = `${trigger === 'auto' ? 'Avtomatik: ' : ''}${result.sent} ta tovar qoldig'i yuborildi${result.rejected.length ? `, ${result.rejected.length} tasi qabul qilinmadi` : ''}`;
      await this.integrations.log(def.code, 'SYNC', status, message, { rejected: result.rejected.slice(0, 200) });
      await this.integrations.updateStatus(setting, status, message, true);
      return { status, message, sent: result.sent, rejected: result.rejected, total: items.length };
    } catch (error: any) {
      const message = error?.message || 'Qoldiqni yuborib bo`lmadi';
      await this.integrations.log(def.code, 'SYNC', 'ERROR', message, error?.body ?? null);
      await this.integrations.updateStatus(setting, 'ERROR', message, true);
      throw new BadRequestException(message);
    } finally {
      this.running.delete(def.code);
    }
  }

  static readonly MARKETPLACES = PROVIDERS.filter((provider) => provider.kind === 'MARKETPLACE').map((provider) => provider.code);
}
