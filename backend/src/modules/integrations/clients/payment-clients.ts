import { createHash, randomUUID } from 'crypto';
import { ApiError, describe, request } from './http';

/**
 * To'lov provayderlari bilan so'rovlar.
 * Natija bir xil ko'rinishda: PAID / PENDING / FAILED / CANCELLED.
 */

export type PayStatus = 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED';
export interface PayResult { status: PayStatus; externalId?: string | null; message?: string; raw?: any }

/* ================================== Click ================================== */
/**
 * Click Merchant API (Click Pass - xaridor ilovasidagi QR/kodni kassir
 * skanerlaydi). Avtorizatsiya: "Auth: merchant_user_id:sha1(timestamp + secret_key):timestamp".
 */
export interface ClickConfig { serviceId: string; merchantUserId: string; secretKey: string; cashboxCode?: string }

const CLICK_BASE = 'https://api.click.uz/v2/merchant';

function clickHeaders(config: ClickConfig) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = createHash('sha1').update(timestamp + config.secretKey).digest('hex');
  return { Auth: `${config.merchantUserId}:${digest}:${timestamp}` };
}

/** Click to'lov holati: 2 - to'langan; manfiy - xato; qolgani - jarayonda */
function clickResult(body: any, fallbackId?: string): PayResult {
  const errorCode = Number(body?.error_code ?? -1);
  const paymentId = body?.payment_id ? String(body.payment_id) : fallbackId || null;
  if (errorCode < 0) return { status: 'FAILED', externalId: paymentId, message: describe(body, 'Click xatosi'), raw: body };
  const state = Number(body?.payment_status);
  if (state === 2) return { status: 'PAID', externalId: paymentId, raw: body };
  if (state < 0) return { status: 'FAILED', externalId: paymentId, message: describe(body, 'To`lov rad etildi'), raw: body };
  return { status: 'PENDING', externalId: paymentId, raw: body };
}

export const click = {
  async pass(config: ClickConfig, otp: string, amount: number): Promise<PayResult> {
    const res = await request(`${CLICK_BASE}/click_pass/payment`, {
      method: 'POST',
      headers: clickHeaders(config),
      body: {
        service_id: Number(config.serviceId),
        otp_data: otp,
        amount,
        ...(config.cashboxCode ? { cashbox_code: config.cashboxCode } : {}),
      },
    });
    if (!res.ok && !res.body?.error_code) throw new ApiError(`Click: ${describe(res.body, `HTTP ${res.status}`)}`, res.status, res.body);
    return clickResult(res.body);
  },

  async status(config: ClickConfig, paymentId: string): Promise<PayResult> {
    const res = await request(`${CLICK_BASE}/payment/status/${config.serviceId}/${paymentId}`, { headers: clickHeaders(config) });
    return clickResult(res.body, paymentId);
  },

  async reverse(config: ClickConfig, paymentId: string) {
    const res = await request(`${CLICK_BASE}/payment/reversal/${config.serviceId}/${paymentId}`, { method: 'DELETE', headers: clickHeaders(config) });
    if (Number(res.body?.error_code ?? -1) < 0) throw new ApiError(`Click: ${describe(res.body, 'qaytarib bo`lmadi')}`, res.status, res.body);
  },

  /** Avtorizatsiyani tekshirish: mavjud bo'lmagan to'lov holati so'raladi */
  async test(config: ClickConfig) {
    const res = await request(`${CLICK_BASE}/payment/status/${config.serviceId}/0`, { headers: clickHeaders(config) });
    // Click noto'g'ri kalitga HTTP 200 bilan error_code -12 ("Неверные данные поставщика") qaytaradi
    if (res.status === 401 || res.status === 403 || Number(res.body?.error_code) === -12) {
      throw new ApiError(`Click: avtorizatsiya xatosi - service_id, merchant_user_id yoki secret_key notog'ri (${describe(res.body, `HTTP ${res.status}`)})`, res.status, res.body);
    }
    if (res.status >= 500) throw new ApiError(`Click serveri javob bermadi (HTTP ${res.status})`, res.status, res.body);
    return `Click kalitlarni qabul qildi (${describe(res.body, `HTTP ${res.status}`)})`;
  },
};

/* ================================== Payme ================================== */
/**
 * Payme Subscribe API (JSON-RPC). Kassa chek yaratadi va xaridorning
 * telefoniga yuboradi; xaridor Payme ilovasida to'laydi, kassa holatni
 * so'rab turadi. Avtorizatsiya: "X-Auth: kassa_id:kalit".
 */
export interface PaymeConfig { merchantId: string; key: string }

const PAYME_URL = (test: boolean) => (test ? 'https://checkout.test.paycom.uz/api' : 'https://checkout.paycom.uz/api');

async function paymeCall(config: PaymeConfig, test: boolean, method: string, params: any) {
  const res = await request(PAYME_URL(test), {
    method: 'POST',
    headers: { 'X-Auth': `${config.merchantId}:${config.key}` },
    body: { id: Date.now(), method, params },
  });
  if (res.body?.error) {
    const error = res.body.error;
    const message = typeof error.message === 'object' ? error.message.uz || error.message.ru || error.message.en : error.message;
    throw new ApiError(`Payme: ${message || 'xato'} (${error.code})`, res.status, res.body);
  }
  if (!res.ok) throw new ApiError(`Payme: HTTP ${res.status}`, res.status, res.body);
  return res.body?.result;
}

/** Payme chek holati: 4 - to'langan, 50 - bekor qilingan */
function paymeState(state: number): PayStatus {
  if (state === 4) return 'PAID';
  if (state === 50 || state === 51) return 'CANCELLED';
  return 'PENDING';
}

export interface PaymeItem { title: string; price: number; count: number; code?: string | null; packageCode?: string | null; vatPercent?: number | null }

export const payme = {
  /** Chek yaratish va telefoniga yuborish. Summa so'mda (Payme ga tiyinda ketadi) */
  async createAndSend(config: PaymeConfig, test: boolean, amount: number, orderId: string, phone: string, items: PaymeItem[] = []): Promise<PayResult> {
    const detail = items.length
      ? {
          receipt_type: 0,
          items: items.map((item) => ({
            title: item.title.slice(0, 128),
            price: Math.round(item.price * 100),
            count: item.count,
            ...(item.code ? { code: item.code } : {}),
            ...(item.packageCode ? { package_code: item.packageCode } : {}),
            vat_percent: item.vatPercent ?? 0,
          })),
        }
      : undefined;
    const created = await paymeCall(config, test, 'receipts.create', {
      amount: Math.round(amount * 100),
      account: { order_id: orderId },
      description: `Gulbahor ${orderId}`,
      ...(detail ? { detail } : {}),
    });
    const receiptId = created?.receipt?._id;
    if (!receiptId) throw new ApiError('Payme chek yaratmadi', undefined, created);
    await paymeCall(config, test, 'receipts.send', { id: receiptId, phone: phone.replace(/\D/g, '') });
    return { status: 'PENDING', externalId: receiptId, raw: created };
  },

  async status(config: PaymeConfig, test: boolean, receiptId: string): Promise<PayResult> {
    const result = await paymeCall(config, test, 'receipts.check', { id: receiptId });
    return { status: paymeState(Number(result?.state)), externalId: receiptId, raw: result };
  },

  async cancel(config: PaymeConfig, test: boolean, receiptId: string) {
    await paymeCall(config, test, 'receipts.cancel', { id: receiptId });
  },

  /** Avtorizatsiyani tekshirish: mavjud bo'lmagan chek so'raladi - "topilmadi" javobi kalit to'g'riligini bildiradi */
  async test(config: PaymeConfig, test: boolean) {
    try {
      await paymeCall(config, test, 'receipts.get', { id: '000000000000000000000000' });
      return 'Payme javob berdi';
    } catch (error: any) {
      const code = error?.body?.error?.code;
      if (code === -32504 || code === -32400) throw new ApiError('Payme: avtorizatsiya xatosi - kassa ID yoki kalit notog`ri', error.status, error.body);
      if (error instanceof ApiError && error.body?.error) return `Payme kalitni qabul qildi (${error.message})`;
      throw error;
    }
  },
};

/* =================================== UDS =================================== */
/**
 * UDS - bonus (ball) tizimi. Xaridor ilovadagi 6 xonali kodni aytadi,
 * kassa balansini va shu xariddan qancha ball yechish mumkinligini
 * so'raydi, keyin operatsiya yaratadi (ball yechiladi, keshbek yoziladi).
 */
export interface UdsConfig { companyId: string; apiKey: string }

const UDS_BASE = 'https://api.uds.app/partner/v2';

function udsHeaders(config: UdsConfig) {
  return {
    Authorization: `Basic ${Buffer.from(`${config.companyId}:${config.apiKey}`).toString('base64')}`,
    'Accept-Charset': 'utf-8',
    'X-Origin-Request-Id': randomUUID(),
    'X-Timestamp': new Date().toISOString(),
  };
}

async function udsCall(config: UdsConfig, path: string, method = 'GET', body?: unknown) {
  const res = await request(`${UDS_BASE}${path}`, { method, headers: udsHeaders(config), body });
  if (res.status === 401 || res.status === 403) throw new ApiError('UDS: avtorizatsiya xatosi - kompaniya ID yoki API kalit notog`ri', res.status, res.body);
  if (!res.ok) throw new ApiError(`UDS: ${describe(res.body, `HTTP ${res.status}`)}`, res.status, res.body);
  return res.body;
}

export const uds = {
  async test(config: UdsConfig) {
    const settings = await udsCall(config, '/settings');
    return `UDS ulandi: ${settings?.name || 'kompaniya'}`;
  },

  /** Kod bo'yicha xaridor va shu summa uchun ball yechish imkoniyati */
  async find(config: UdsConfig, code: string, total: number) {
    const data = await udsCall(config, `/customers/find?code=${encodeURIComponent(code)}&total=${total}`);
    return {
      name: data?.user?.displayName || null,
      phone: data?.user?.phone || null,
      points: Number(data?.user?.participant?.points ?? 0),
      maxPoints: Number(data?.purchase?.maxPoints ?? 0),
      discountAmount: Number(data?.purchase?.discountAmount ?? 0),
      cashBack: Number(data?.purchase?.cashBack ?? 0),
    };
  },

  /** Ball yechish (1 ball = 1 so'm). total - chek summasi, points - yechiladigan ball */
  async spend(config: UdsConfig, code: string, total: number, points: number, number: string, cashier: { id: string; name: string }): Promise<PayResult> {
    const data = await udsCall(config, '/operations', 'POST', {
      code,
      participant: null,
      nonce: randomUUID(),
      cashier: { externalId: cashier.id, name: cashier.name },
      receipt: { total, cash: Math.max(0, total - points), points, number, skipLoyaltyTotal: null },
    });
    return { status: 'PAID', externalId: data?.id ? String(data.id) : null, raw: data };
  },

  async refund(config: UdsConfig, operationId: string) {
    await udsCall(config, `/operations/${operationId}/refund`, 'POST', { partialAmount: null });
  },
};
