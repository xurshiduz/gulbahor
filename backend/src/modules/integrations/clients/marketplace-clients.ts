import { ApiError, chunk, describe, request } from './http';

/**
 * Marketpleyslarga qoldiq yuborish. Har biri bir xil natija qaytaradi:
 * yuborilgan, rad etilgan (sabab bilan) tovarlar.
 */

export interface StockItem {
  materialId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  amount: number;
}

export interface PushResult {
  sent: number;
  rejected: { key: string; name: string; reason: string }[];
}

export interface RemoteWarehouse { id: string; name: string }

/* ================================ Wildberries ================================ */
/** Marketplace API: tovar shtrix-kodi (sku) bo'yicha, bir so'rovda 1000 tagacha */
const WB_BASE = 'https://marketplace-api.wildberries.ru';

export const wildberries = {
  async warehouses(token: string): Promise<RemoteWarehouse[]> {
    const res = await request(`${WB_BASE}/api/v3/warehouses`, { headers: { Authorization: token } });
    if (res.status === 401) throw new ApiError('Wildberries: token notog`ri yoki muddati o`tgan', res.status, res.body);
    if (!res.ok) throw new ApiError(`Wildberries: ${describe(res.body, `HTTP ${res.status}`)}`, res.status, res.body);
    return (res.body || []).map((row: any) => ({ id: String(row.id), name: row.name }));
  },

  async push(token: string, warehouseId: string, items: StockItem[]): Promise<PushResult> {
    const result: PushResult = { sent: 0, rejected: [] };
    const valid = items.filter((item) => {
      if (item.barcode) return true;
      result.rejected.push({ key: item.sku || item.materialId, name: item.name, reason: 'Shtrix-kod yo`q' });
      return false;
    });
    for (const part of chunk(valid, 1000)) {
      const res = await request(`${WB_BASE}/api/v3/stocks/${warehouseId}`, {
        method: 'PUT',
        headers: { Authorization: token },
        body: { stocks: part.map((item) => ({ sku: item.barcode, amount: item.amount })) },
      });
      if (res.ok) { result.sent += part.length; continue; }
      if (res.status === 401) throw new ApiError(`Wildberries: token notog'ri yoki muddati o'tgan (${describe(res.body, 'HTTP 401')})`, res.status, res.body);
      if (res.status === 409 && Array.isArray(res.body)) {
        // Rad etilgan shtrix-kodlar sababi bilan qaytadi, qolganlari qabul qilingan
        const bad = new Map<string, string>();
        for (const error of res.body) for (const row of error.data || []) bad.set(String(row.sku), error.message || error.code);
        for (const item of part) {
          const reason = bad.get(String(item.barcode));
          if (reason) result.rejected.push({ key: item.barcode as string, name: item.name, reason });
          else result.sent += 1;
        }
        continue;
      }
      throw new ApiError(`Wildberries: ${describe(res.body, `HTTP ${res.status}`)}`, res.status, res.body);
    }
    return result;
  },
};

/* =================================== Ozon =================================== */
/** Seller API: offer_id (artikul) bo'yicha, bir so'rovda 100 tagacha */
const OZON_BASE = 'https://api-seller.ozon.ru';

function ozonHeaders(clientId: string, apiKey: string) {
  return { 'Client-Id': clientId, 'Api-Key': apiKey };
}

export const ozon = {
  async warehouses(clientId: string, apiKey: string): Promise<RemoteWarehouse[]> {
    const res = await request(`${OZON_BASE}/v1/warehouse/list`, { method: 'POST', headers: ozonHeaders(clientId, apiKey), body: {} });
    if (res.status === 401 || res.status === 403) throw new ApiError('Ozon: Client-Id yoki Api-Key notog`ri', res.status, res.body);
    if (!res.ok) throw new ApiError(`Ozon: ${describe(res.body, `HTTP ${res.status}`)}`, res.status, res.body);
    return (res.body?.result || []).map((row: any) => ({ id: String(row.warehouse_id), name: row.name }));
  },

  async push(clientId: string, apiKey: string, warehouseId: string, items: StockItem[], matchBy: 'sku' | 'barcode'): Promise<PushResult> {
    const result: PushResult = { sent: 0, rejected: [] };
    const keyOf = (item: StockItem) => (matchBy === 'barcode' ? item.barcode : item.sku);
    const valid = items.filter((item) => {
      if (keyOf(item)) return true;
      result.rejected.push({ key: item.materialId, name: item.name, reason: matchBy === 'barcode' ? 'Shtrix-kod yo`q' : 'Artikul yo`q' });
      return false;
    });
    const byKey = new Map(valid.map((item) => [String(keyOf(item)), item]));
    for (const part of chunk(valid, 100)) {
      const res = await request(`${OZON_BASE}/v2/products/stocks`, {
        method: 'POST',
        headers: ozonHeaders(clientId, apiKey),
        body: { stocks: part.map((item) => ({ offer_id: String(keyOf(item)), stock: item.amount, warehouse_id: Number(warehouseId) })) },
      });
      if (!res.ok) throw new ApiError(`Ozon: ${describe(res.body, `HTTP ${res.status}`)}`, res.status, res.body);
      for (const row of res.body?.result || []) {
        if (row.updated) { result.sent += 1; continue; }
        const item = byKey.get(String(row.offer_id));
        result.rejected.push({ key: String(row.offer_id), name: item?.name || '', reason: (row.errors || []).map((e: any) => e.message || e.code).join('; ') || 'Qabul qilinmadi' });
      }
    }
    return result;
  },
};

/* =============================== Uzum Market =============================== */
/**
 * Seller OpenAPI (FBS qoldiqlari). Uzumda har tovar varianti o'z skuId siga
 * ega - bizning tovar shtrix-kod bo'yicha topiladi.
 */
const UZUM_BASE = 'https://api-seller.uzum.uz/api/seller-openapi';

async function uzumCall(token: string, path: string, method = 'GET', body?: unknown) {
  const res = await request(`${UZUM_BASE}${path}`, { method, headers: { Authorization: token }, body });
  if (res.status === 401 || res.status === 403) throw new ApiError('Uzum Market: token notog`ri yoki ruxsat yo`q', res.status, res.body);
  if (!res.ok) throw new ApiError(`Uzum Market: ${describe(res.body, `HTTP ${res.status}`)}`, res.status, res.body);
  return res.body;
}

export const uzumMarket = {
  /** Do'konlar - ulanishni tekshirish va "ombor" sifatida tanlash uchun */
  async warehouses(token: string): Promise<RemoteWarehouse[]> {
    const shops = await uzumCall(token, '/v1/shops');
    return (Array.isArray(shops) ? shops : shops?.payload || []).map((row: any) => ({ id: String(row.id), name: row.name || row.shopTitle || String(row.id) }));
  },

  /** Do'kondagi SKU lar: shtrix-kod -> skuId */
  async skuMap(token: string, shopId: string) {
    const map = new Map<string, number>();
    for (let page = 0; page < 200; page++) {
      const data = await uzumCall(token, `/v1/product/shop/${shopId}?size=100&page=${page}`);
      const products = data?.productList || data?.payload?.productList || [];
      for (const product of products) {
        for (const sku of product.skuList || []) if (sku.barcode) map.set(String(sku.barcode), Number(sku.skuId));
      }
      if (products.length < 100) break;
    }
    return map;
  },

  async push(token: string, shopId: string, items: StockItem[]): Promise<PushResult> {
    const result: PushResult = { sent: 0, rejected: [] };
    const skuIds = await this.skuMap(token, shopId);
    const list: { skuId: number; amount: number }[] = [];
    for (const item of items) {
      const skuId = item.barcode ? skuIds.get(String(item.barcode)) : undefined;
      if (!skuId) {
        result.rejected.push({ key: item.barcode || item.sku || item.materialId, name: item.name, reason: item.barcode ? 'Uzum do`konida bu shtrix-kodli SKU yo`q' : 'Shtrix-kod yo`q' });
        continue;
      }
      list.push({ skuId, amount: item.amount });
    }
    for (const part of chunk(list, 500)) {
      await uzumCall(token, '/v2/fbs/sku/stocks', 'POST', { skuAmountList: part });
      result.sent += part.length;
    }
    return result;
  },
};
