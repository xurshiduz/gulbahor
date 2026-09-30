/** Tashqi API ga so'rov: vaqt chegarasi, JSON, tushunarli xato */

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: any) {
    super(message);
  }
}

const TIMEOUT_MS = 20000;

export async function request(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let body: any = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* JSON emas */ }
    return { status: res.status, ok: res.ok, body };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new ApiError('Javob kelmadi (vaqt tugadi)');
    throw new ApiError(`Ulanib bo'lmadi: ${error?.cause?.code || error?.message || 'tarmoq xatosi'}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Javobdan qisqa xato matni */
export function describe(body: any, fallback: string) {
  if (!body) return fallback;
  if (typeof body === 'string') return body.slice(0, 300);
  return String(body.message || body.error_note || body.error?.message || body.detail || body.title || JSON.stringify(body).slice(0, 300));
}

/** Ro'yxatni bo'laklarga ajratadi (marketpleys bir so'rovda cheklangan son qabul qiladi) */
export function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
