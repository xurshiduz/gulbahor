import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IntegrationTransaction, TransactionStatus } from './integration.entity';
import { IntegrationsService } from './integrations.service';
import { StartPaymentDto } from './dto/integrations.dto';
import { ApiError } from './clients/http';
import { PayResult, click, payme, uds } from './clients/payment-clients';
import { CashRegistersService } from '../cash/cash-registers.service';
import { Material } from '../materials/entities/material.entity';

/**
 * Kassadagi integratsiyalashgan to'lovlar.
 *
 *  - Click Pass: xaridor ilovasidagi kod skanerlanadi - to'lov darhol yechiladi
 *  - Payme: chek xaridor telefoniga yuboriladi, u ilovada to'laydi - kassa holatni so'raydi
 *  - UDS: xaridor kodi bo'yicha ball yechiladi (1 ball = 1 so'm)
 *  - Arca, Uzum: terminalda to'langach RRN / tranzaksiya raqami kiritiladi
 *
 * Chek yopilganda tranzaksiya sotuv hujjatiga bog'lanadi (`attach`).
 */
@Injectable()
export class PaymentGatewayService {
  constructor(
    @InjectRepository(IntegrationTransaction) private readonly repo: Repository<IntegrationTransaction>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    private readonly integrations: IntegrationsService,
    private readonly cashRegisters: CashRegistersService,
  ) {}

  private view(tx: IntegrationTransaction) {
    const { raw, createdBy, ...rest } = tx;
    return rest;
  }

  async findOne(id: string) {
    const tx = await this.repo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('Tranzaksiya topilmadi');
    return tx;
  }

  /** Kassada yoqilgan to'lov integratsiyalari - qaysi to'lov turi qaysi provayderga ulangan */
  async enabledForPos() {
    const all = await this.integrations.list();
    return all
      .filter((row) => row.kind === 'PAYMENT' && row.isEnabled && row.options?.paymentTypeId)
      .map((row) => ({ provider: row.code, title: row.title, api: row.api, paymentTypeId: row.options.paymentTypeId as string }));
  }

  private apply(tx: IntegrationTransaction, result: PayResult) {
    tx.status = result.status as TransactionStatus;
    if (result.externalId) tx.externalId = result.externalId;
    tx.error = result.status === 'FAILED' ? result.message || 'To`lov o`tmadi' : null;
    tx.raw = result.raw ?? tx.raw;
  }

  async start(dto: StartPaymentDto, user: any) {
    const { def, setting, credentials } = await this.integrations.config(dto.provider);
    if (def.kind !== 'PAYMENT') throw new BadRequestException(`${def.title} to'lov integratsiyasi emas`);
    await this.cashRegisters.assertAccess(dto.cashRegisterId, user);

    const tx = this.repo.create({
      provider: def.code, status: TransactionStatus.PENDING, amount: dto.amount,
      cashRegisterId: dto.cashRegisterId, createdById: user?.id || null,
    });
    await this.repo.save(tx);
    // Provayderga yuboriladigan buyurtma raqami - tranzaksiyaning qisqa id si
    const orderId = tx.id.slice(0, 8).toUpperCase();
    tx.reference = orderId;

    try {
      switch (def.api) {
        case 'click': {
          const code = String(dto.code || '').trim();
          if (!code) throw new BadRequestException('Click Pass kodini skanerlang');
          this.apply(tx, await click.pass(credentials as any, code, dto.amount));
          break;
        }
        case 'payme': {
          if (!dto.phone) throw new BadRequestException('Chek yuboriladigan telefon raqamni kiriting');
          this.apply(tx, await payme.createAndSend(credentials as any, setting.isTest, dto.amount, orderId, dto.phone, await this.fiscalItems(dto)));
          break;
        }
        case 'uds': {
          const code = String(dto.code || '').trim();
          if (!/^\d{6}$/.test(code)) throw new BadRequestException('UDS kodi 6 ta raqamdan iborat');
          const total = Math.max(dto.receiptTotal || 0, dto.amount);
          this.apply(tx, await uds.spend(credentials as any, code, total, dto.amount, orderId, { id: user?.id || 'cashier', name: user?.name || 'Kassir' }));
          break;
        }
        default: {
          // Terminal: to'lov terminalda o'tgan, kassir chekdagi RRN ni kiritadi
          const reference = String(dto.reference || '').trim();
          if (reference.length < 4) throw new BadRequestException('Terminal chekidagi RRN / tranzaksiya raqamini kiriting');
          tx.reference = reference;
          tx.status = TransactionStatus.PAID;
        }
      }
    } catch (error: any) {
      tx.status = TransactionStatus.FAILED;
      tx.error = error?.message || 'Xatolik';
      tx.raw = error?.body ?? null;
      await this.repo.save(tx);
      if (error instanceof ApiError) await this.integrations.log(def.code, 'PAYMENT', 'ERROR', tx.error as string, error.body ?? null);
      throw error instanceof ApiError ? new BadRequestException(error.message) : error;
    }

    await this.repo.save(tx);
    if (tx.status === TransactionStatus.FAILED) throw new BadRequestException(tx.error || 'To`lov o`tmadi');
    return this.view(tx);
  }

  /** Payme fiskal cheki uchun tovarlar: nomi, MXIK, o'ram kodi, QQS */
  private async fiscalItems(dto: StartPaymentDto) {
    if (!dto.items?.length) return [];
    const materials = await this.materialRepo.findBy({ id: In(dto.items.map((item) => item.materialId)) });
    const byId = new Map(materials.map((material) => [material.id, material]));
    return dto.items.map((item) => {
      const material = byId.get(item.materialId);
      return {
        title: material?.name || 'Tovar', price: item.price, count: item.quantity,
        code: material?.mxikCode || null, packageCode: material?.packageCode || null, vatPercent: material?.vatRate ?? 0,
      };
    });
  }

  /** Holatni yangilash (Payme - xaridor to'laguncha kutiladi; Click - ba'zan tasdiq kutadi) */
  async status(id: string) {
    const tx = await this.findOne(id);
    if (tx.status !== TransactionStatus.PENDING || !tx.externalId) return this.view(tx);
    const { def, setting, credentials } = await this.integrations.config(tx.provider);
    try {
      if (def.api === 'payme') this.apply(tx, await payme.status(credentials as any, setting.isTest, tx.externalId));
      else if (def.api === 'click') this.apply(tx, await click.status(credentials as any, tx.externalId));
      await this.repo.save(tx);
    } catch (error: any) {
      // Vaqtinchalik xato - holat o'zgarmaydi, keyingi so'rovda qayta urinadi
      return { ...this.view(tx), checkError: error?.message || 'Holatni olib bo`lmadi' };
    }
    return this.view(tx);
  }

  /**
   * Bekor qilish: chek yopilmay qolgan to'lov qaytariladi. Sotuvga
   * bog'langan tranzaksiya bu yerdan bekor qilinmaydi (qaytarish hujjati orqali).
   */
  async cancel(id: string) {
    const tx = await this.findOne(id);
    if (tx.outboundDocumentId) throw new BadRequestException('To`lov chekka bog`langan - bekor qilish uchun qaytarish hujjatini rasmiylashtiring');
    if (tx.status === TransactionStatus.CANCELLED || tx.status === TransactionStatus.FAILED) return this.view(tx);

    const { def, setting, credentials } = await this.integrations.config(tx.provider, false);
    try {
      if (tx.externalId) {
        if (def.api === 'click' && tx.status === TransactionStatus.PAID) await click.reverse(credentials as any, tx.externalId);
        if (def.api === 'payme') await payme.cancel(credentials as any, setting.isTest, tx.externalId);
        if (def.api === 'uds' && tx.status === TransactionStatus.PAID) await uds.refund(credentials as any, tx.externalId);
      }
    } catch (error: any) {
      await this.integrations.log(def.code, 'PAYMENT', 'ERROR', `Bekor qilinmadi: ${error?.message}`, error?.body ?? null);
      throw new BadRequestException(error?.message || 'Bekor qilib bo`lmadi');
    }
    tx.status = TransactionStatus.CANCELLED;
    await this.repo.save(tx);
    return this.view(tx);
  }

  /** UDS: kod bo'yicha xaridor va yechish mumkin bo'lgan ball */
  async udsFind(code: string, total: number) {
    if (!/^\d{6}$/.test(String(code || '').trim())) throw new BadRequestException('UDS kodi 6 ta raqamdan iborat');
    const { credentials } = await this.integrations.config('UDS');
    try {
      return await uds.find(credentials as any, code.trim(), total);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'UDS javob bermadi');
    }
  }

  /** Kassa: sotuvdan oldin - tranzaksiya to'langan, ishlatilmagan va summasi mos */
  async assertUsable(id: string, amount: number, cashRegisterId: string) {
    const tx = await this.findOne(id);
    if (tx.status !== TransactionStatus.PAID) throw new BadRequestException('Integratsiya orqali to`lov hali o`tmagan');
    if (tx.outboundDocumentId) throw new BadRequestException('Bu to`lov boshqa chekka bog`langan');
    if (tx.cashRegisterId && tx.cashRegisterId !== cashRegisterId) throw new BadRequestException('To`lov boshqa kassada qilingan');
    if (Math.abs(Number(tx.amount) - amount) > 0.01) throw new BadRequestException('To`lov summasi chekdagi summaga mos emas');
    return tx;
  }

  /** Chek yopilgach - tranzaksiya sotuv va pul tushumiga bog'lanadi */
  async attach(id: string, outboundDocumentId: string, paymentId: string) {
    await this.repo.update(id, { outboundDocumentId, paymentId });
  }
}
