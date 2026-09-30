/**
 * Tarmoq cheklovi (ixtiyoriy): tizim faqat ruxsat etilgan tarmoqlardan ishlaydi.
 *
 * Sukut bo'yicha O'CHIQ. Yoqish uchun .env da NETWORK_RESTRICTION=on va
 * ALLOWED_NETWORKS (CIDR, vergul bilan) beriladi. Yoqilganda har so'rovda
 * foydalanuvchining IP manzili ruxsat etilgan tarmoqlar bilan solishtiriladi,
 * tashqaridan kelgan so'rov rad etiladi. Istisno: Super admin va
 * kartochkasida "Tashqaridan ishlashga ruxsat" (remoteAccess) belgilangan
 * xodimlar - buni faqat Super admin qo'yadi.
 *
 * Serverning o'zi (localhost) doim ruxsatda - lokal ishga tushirish va
 * ichki xizmatlar uchun. Nginx orqasida real IP X-Forwarded-For dan olinadi.
 */
import { ForbiddenException } from '@nestjs/common';
import { userIsSuperAdmin } from './permissions.util';

/** ALLOWED_NETWORKS berilmasa - odatiy xususiy tarmoqlar */
const DEFAULT_NETWORKS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
/**
 * Serverning o'zi. DIQQAT: nginx real IP ni uzatmasa hamma so'rov shu
 * manzildan kelayotgandek ko'rinadi va cheklov umuman ishlamaydi - shuning
 * uchun bu faqat proxy sarlavhalari umuman bo'lmaganda qo'llanadi
 * (ichki xizmatlar, lokal ishga tushirish).
 */
const ALWAYS = ['127.0.0.0/8'];
/**
 * Proksi (nginx) qaysi manzillardan kelishi mumkin. Nginx alohida serverda
 * bo'lsa so'rov o'shanikidek ko'rinadi - haqiqiy mijoz manzili esa uning
 * qo'ygan X-Real-IP / X-Forwarded-For sarlavhasida. Shu manzillardan
 * kelgan so'rovlardagina sarlavhaga ishonamiz; boshqasi uni o'zi yozib
 * yuborishi mumkin. .env dagi TRUSTED_PROXIES bilan aniq belgilanadi
 * (masalan nginx serverining IP si), berilmasa - ichki tarmoqlar.
 */
const DEFAULT_TRUSTED_PROXIES = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

export const OUTSIDE_NETWORK_MESSAGE = "Tizim faqat ruxsat etilgan tarmoqdan ishlaydi. Ichki tarmoqqa ulaning yoki administratorga murojaat qiling.";

function parseCidr(cidr: string): { base: number; mask: number } | null {
  const m = cidr.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
  if (!m) return null;
  const bits = m[5] === undefined ? 32 : Number(m[5]);
  const base = ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

function ipToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  return ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0;
}

/** "::ffff:192.168.1.5" -> "192.168.1.5"; "::1" -> "127.0.0.1" */
export function normalizeIp(raw: string | undefined | null): string {
  let ip = String(raw || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

/** Shu manzil ishonchli proksimi (nginx) */
export function isTrustedProxyIp(ip: string): boolean {
  const list = String(process.env.TRUSTED_PROXIES || '').split(',').map((x) => x.trim()).filter(Boolean);
  const nets = (list.length ? list : DEFAULT_TRUSTED_PROXIES)
    .map(parseCidr)
    .filter((n): n is { base: number; mask: number } => !!n);
  const n = ipToInt(normalizeIp(ip));
  if (n === null) return false;
  return nets.some((net) => ((n & net.mask) >>> 0) === net.base);
}

/** So'rov ishonchli proksidan (nginx) keldimi */
export function fromTrustedProxy(req: any): boolean {
  return isTrustedProxyIp(normalizeIp(req?.socket?.remoteAddress || req?.ip));
}

/**
 * Haqiqiy mijoz manzili.
 *
 * Nginx alohida serverda tursa, so'rov o'sha serverning ichki IP si bilan
 * keladi - u har doim "ichki tarmoqda" bo'ladi va cheklov ma'nosini
 * yo'qotadi. Shuning uchun so'rov ishonchli proksidan kelgan bo'lsa
 * mijoz manzili X-Forwarded-For zanjiridan olinadi: o'ngdan chapga qarab
 * proksilar tashlab ketiladi, birinchi proksi bo'lmagan manzil - mijoz.
 *
 * Ikkita nginx bo'lsa ham shu ishlaydi: zanjir "mijoz, nginx1" bo'lib
 * keladi va nginx2 X-Real-IP ni o'ziga (nginx1 manziliga) almashtirib
 * yuborsa ham zanjir buzilmaydi. Mijoz o'zi yozib yuborgan soxta
 * yozuvlar zanjirning boshida qoladi va hisobga olinmaydi.
 */
export function clientIp(req: any): string {
  const socketIp = normalizeIp(req?.socket?.remoteAddress || req?.ip);
  if (!fromTrustedProxy(req)) return socketIp;

  const chain = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',').map((x) => normalizeIp(x)).filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!isTrustedProxyIp(chain[i])) return chain[i];
  }
  // Zanjirdagilarning hammasi ichki tarmoqdan - mijoz ham ichkarida
  if (chain.length) return chain[0];

  const real = normalizeIp(req?.headers?.['x-real-ip']);
  return real || socketIp;
}

let cached: { key: string; nets: { base: number; mask: number }[] } | null = null;
function allowedNetworks() {
  const key = process.env.ALLOWED_NETWORKS || '';
  if (cached && cached.key === key) return cached.nets;
  const list = key.split(',').map((s) => s.trim()).filter(Boolean);
  const nets = [...(list.length ? list : DEFAULT_NETWORKS), ...ALWAYS]
    .map(parseCidr)
    .filter((n): n is { base: number; mask: number } => !!n);
  cached = { key, nets };
  return nets;
}

/** Cheklov yoqilganmi (NETWORK_RESTRICTION=on bilan yoqiladi) */
export function networkRestrictionEnabled() {
  return !/^(0|off|false|no)$/i.test(String(process.env.NETWORK_RESTRICTION || 'off'));
}

/** Ruxsat etilgan tarmoqlar ro'yxati - diagnostika uchun */
export function allowedNetworkList(): string[] {
  const list = String(process.env.ALLOWED_NETWORKS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_NETWORKS;
}

export function ipAllowed(ip: string): boolean {
  const n = ipToInt(normalizeIp(ip));
  if (n === null) return false;
  return allowedNetworks().some((net) => ((n & net.mask) >>> 0) === net.base);
}

/** Cheklov shu so'rovga qanday qo'llanishi - diagnostika va tekshiruv uchun bir joyda */
export function networkStatus(user: any, req: any) {
  const socketIp = normalizeIp(req?.socket?.remoteAddress || req?.ip);
  const realIp = normalizeIp(req?.headers?.['x-real-ip']);
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').trim();
  const ip = clientIp(req);
  const enabled = networkRestrictionEnabled();
  const proxyHeaders = !!(realIp || forwarded);
  const trustedProxy = fromTrustedProxy(req);
  /*
   * Cheklov ishlamay qoladigan holat: so'rov proksi (nginx) manzilidan
   * kelyapti, lekin u haqiqiy mijoz manzilini uzatmagan - hamma so'rov
   * "ichki tarmoqdan" bo'lib ko'rinadi.
   */
  const proxyMisconfigured = enabled && trustedProxy && !proxyHeaders;
  return {
    enabled,
    networks: allowedNetworkList(),
    socketIp,
    realIp: realIp || null,
    forwardedFor: forwarded || null,
    trustedProxy,
    ip,
    inside: ipAllowed(ip),
    exempt: !!user && (userIsSuperAdmin(user) ? 'SUPER_ADMIN' : user.remoteAccess === true ? 'REMOTE_ACCESS' : null),
    proxyMisconfigured,
  };
}

/** Foydalanuvchi shu IP dan ishlashi mumkinmi; mumkin bo'lmasa 403 */
export function assertInsideNetwork(user: any, req: any) {
  if (!networkRestrictionEnabled()) return;
  if (!user) return;
  if (userIsSuperAdmin(user) || user.remoteAccess === true) return;
  if (ipAllowed(clientIp(req))) return;
  throw new ForbiddenException({ statusCode: 403, message: OUTSIDE_NETWORK_MESSAGE, code: 'OUTSIDE_NETWORK' });
}
