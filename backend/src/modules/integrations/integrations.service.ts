import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IntegrationLog, IntegrationSetting, IntegrationTransaction } from './integration.entity';
import { PROVIDERS, ProviderDef, providerByCode } from './providers';
import { decryptSecret, encryptSecret, maskSecret } from './secret-box';
import { UpdateIntegrationDto } from './dto/integrations.dto';
import { PaymentType } from '../accounting/entities/payment-type.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { click, payme, uds } from './clients/payment-clients';
import { ozon, uzumMarket, wildberries } from './clients/marketplace-clients';

/** Ichki foydalanish uchun: kalitlar ochilgan holda */
export interface IntegrationConfig {
  def: ProviderDef;
  setting: IntegrationSetting;
  credentials: Record<string, string>;
}

/**
 * Integratsiya sozlamalari: kalitlar bazada (maxfiylari shifrlangan),
 * ulanishni tekshirish, jurnal. To'lov va qoldiq yuborish alohida
 * xizmatlarda (payment-gateway, marketplace-sync).
 */
@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(IntegrationSetting) private readonly repo: Repository<IntegrationSetting>,
    @InjectRepository(IntegrationLog) private readonly logRepo: Repository<IntegrationLog>,
    @InjectRepository(IntegrationTransaction) private readonly txRepo: Repository<IntegrationTransaction>,
    @InjectRepository(PaymentType) private readonly paymentTypeRepo: Repository<PaymentType>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
  ) {}

  private definition(code: string) {
    const def = providerByCode(String(code || '').toUpperCase());
    if (!def) throw new NotFoundException('Bunday integratsiya yo`q');
    return def;
  }

  /** Sozlama qatori; hali saqlanmagan bo'lsa - bo'sh (bazaga yozilmaydi) */
  private async settingOf(code: string) {
    return (await this.repo.findOne({ where: { provider: code } })) || this.repo.create({ provider: code, isEnabled: false, isTest: false, credentials: {}, options: {} });
  }

  /** Javob uchun: maxfiy kalitlar o'rniga "saqlangan / oxirgi 4 belgi" */
  private view(def: ProviderDef, setting: IntegrationSetting) {
    const credentials: Record<string, { value?: string; set: boolean; hint?: string | null; broken?: boolean }> = {};
    for (const field of def.fields) {
      const stored = setting.credentials?.[field.key];
      if (field.secret) {
        const plain = decryptSecret(stored);
        credentials[field.key] = { set: !!stored, hint: maskSecret(plain), broken: !!stored && plain === null };
      } else {
        credentials[field.key] = { value: stored || '', set: !!stored };
      }
    }
    return {
      code: def.code, kind: def.kind, title: def.title, api: def.api, docsUrl: def.docsUrl || null,
      hasTestMode: !!def.hasTestMode,
      fields: def.fields.map((field) => ({ key: field.key, secret: !!field.secret, required: !!field.required, placeholder: field.placeholder || null })),
      isEnabled: setting.isEnabled, isTest: setting.isTest,
      credentials, options: setting.options || {},
      lastSyncAt: setting.lastSyncAt || null, lastStatus: setting.lastStatus || null, lastMessage: setting.lastMessage || null,
      /** Kalitlar to'liq kiritilganmi */
      configured: def.fields.every((field) => !field.required || !!setting.credentials?.[field.key]),
    };
  }

  async list() {
    const settings = await this.repo.find();
    const byCode = new Map(settings.map((row) => [row.provider, row]));
    return PROVIDERS.map((def) => this.view(def, byCode.get(def.code) || this.repo.create({ provider: def.code, isEnabled: false, isTest: false, credentials: {}, options: {} })));
  }

  async save(code: string, dto: UpdateIntegrationDto) {
    const def = this.definition(code);
    const setting = await this.settingOf(def.code);
    const credentials = { ...(setting.credentials || {}) };

    if (dto.credentials) {
      const known = new Set(def.fields.map((field) => field.key));
      for (const [key, raw] of Object.entries(dto.credentials)) {
        if (!known.has(key)) throw new BadRequestException(`Noma'lum maydon: ${key}`);
        const field = def.fields.find((item) => item.key === key)!;
        const value = String(raw ?? '').trim();
        if (value.length > 2000) throw new BadRequestException('Kalit juda uzun');
        if (field.secret) {
          // Bo'sh maxfiy maydon - eskisi qoladi (formada ko'rsatilmaydi)
          if (value) credentials[key] = encryptSecret(value);
        } else if (value) credentials[key] = value;
        else delete credentials[key];
      }
    }

    const options = { ...(setting.options || {}) };
    if (dto.paymentTypeId !== undefined) {
      if (def.kind !== 'PAYMENT') throw new BadRequestException('To`lov turi faqat to`lov integratsiyasida');
      if (dto.paymentTypeId && !(await this.paymentTypeRepo.findOne({ where: { id: dto.paymentTypeId } }))) {
        throw new NotFoundException('To`lov turi topilmadi');
      }
      options.paymentTypeId = dto.paymentTypeId || null;
    }
    if (dto.marketplace) {
      if (def.kind !== 'MARKETPLACE') throw new BadRequestException('Bu sozlama faqat marketpleys uchun');
      const m = dto.marketplace;
      if (m.warehouseIds !== undefined) {
        const ids = [...new Set(m.warehouseIds)];
        if (ids.length && (await this.warehouseRepo.count({ where: { id: In(ids) } })) !== ids.length) {
          throw new NotFoundException('Tanlangan omborlardan biri topilmadi');
        }
        options.warehouseIds = ids;
      }
      if (m.targetWarehouseId !== undefined) options.targetWarehouseId = String(m.targetWarehouseId || '').trim() || null;
      if (m.matchBy !== undefined) options.matchBy = m.matchBy;
      if (m.safetyStock !== undefined) options.safetyStock = m.safetyStock;
      if (m.autoSyncMinutes !== undefined) options.autoSyncMinutes = m.autoSyncMinutes;
    }

    const isEnabled = dto.isEnabled ?? setting.isEnabled;
    if (isEnabled) {
      const missing = def.fields.filter((field) => field.required && !credentials[field.key]);
      if (missing.length) throw new BadRequestException(`Yoqish uchun kalitlarni to'ldiring: ${missing.map((field) => field.key).join(', ')}`);
      if (def.kind === 'PAYMENT' && !options.paymentTypeId) throw new BadRequestException('Yoqish uchun to`lov turini tanlang - tushum shu turga yoziladi');
      if (def.kind === 'MARKETPLACE') {
        if (!options.warehouseIds?.length) throw new BadRequestException('Yoqish uchun qoldig`i yuboriladigan omborlarni tanlang');
        if (def.api !== 'uzum-market' && !options.targetWarehouseId) throw new BadRequestException('Yoqish uchun marketpleysdagi omborni tanlang');
      }
    }

    Object.assign(setting, { credentials, options, isEnabled, isTest: dto.isTest ?? setting.isTest });
    await this.repo.save(setting);
    return this.view(def, setting);
  }

  /** Ichki: yoqilgan (yoki tekshiruv uchun - yoqilmagan ham) integratsiya kalitlari bilan */
  async config(code: string, requireEnabled = true): Promise<IntegrationConfig> {
    const def = this.definition(code);
    const setting = await this.settingOf(def.code);
    if (requireEnabled && !setting.isEnabled) throw new BadRequestException(`${def.title} integratsiyasi yoqilmagan`);
    const credentials: Record<string, string> = {};
    for (const field of def.fields) {
      const stored = setting.credentials?.[field.key];
      if (!stored) continue;
      const value = field.secret ? decryptSecret(stored) : stored;
      if (value === null) throw new BadRequestException(`${def.title}: saqlangan kalitni ochib bo'lmadi - qayta kiriting`);
      credentials[field.key] = value;
    }
    const missing = def.fields.filter((field) => field.required && !credentials[field.key]);
    if (missing.length) throw new BadRequestException(`${def.title}: kalitlar to'liq emas (${missing.map((field) => field.key).join(', ')})`);
    return { def, setting, credentials };
  }

  async log(provider: string, action: string, status: string, message: string, details?: any) {
    await this.logRepo.save(this.logRepo.create({ provider, action, status, message: message.slice(0, 2000), details: details ?? null }));
  }

  async updateStatus(setting: IntegrationSetting, status: string, message: string, synced = false) {
    if (!setting.id) return;
    await this.repo.update(setting.id, { lastStatus: status, lastMessage: message.slice(0, 2000), ...(synced ? { lastSyncAt: new Date() } : {}) });
  }

  /** Ulanishni tekshirish - saqlangan kalitlar bilan provayderga zararsiz so'rov */
  async test(code: string) {
    const { def, setting, credentials: c } = await this.config(code, false);
    try {
      let message: string;
      switch (def.api) {
        case 'click': message = await click.test(c as any); break;
        case 'payme': message = await payme.test(c as any, setting.isTest); break;
        case 'uds': message = await uds.test(c as any); break;
        case 'wildberries': message = `Wildberries ulandi: ${(await wildberries.warehouses(c.token)).length} ta ombor`; break;
        case 'ozon': message = `Ozon ulandi: ${(await ozon.warehouses(c.clientId, c.apiKey)).length} ta ombor`; break;
        case 'uzum-market': message = `Uzum Market ulandi: ${(await uzumMarket.warehouses(c.token)).length} ta do'kon`; break;
        default: message = 'Bu integratsiya API siz ishlaydi - tekshiriladigan ulanish yo`q';
      }
      await this.log(def.code, 'TEST', 'OK', message);
      await this.updateStatus(setting, 'OK', message);
      return { ok: true, message };
    } catch (error: any) {
      const message = error?.message || 'Xatolik';
      await this.log(def.code, 'TEST', 'ERROR', message, error?.body ?? null);
      await this.updateStatus(setting, 'ERROR', message);
      return { ok: false, message };
    }
  }

  async logs(code: string) {
    const def = this.definition(code);
    return this.logRepo.find({ where: { provider: def.code }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async transactions() {
    const rows = await this.txRepo.find({ relations: { createdBy: true }, order: { createdAt: 'DESC' }, take: 200 });
    return rows.map(({ createdBy, raw, ...row }) => ({ ...row, createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null }));
  }
}
