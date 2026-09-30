/**
 * Doimiy (tizim) rollar. Nomi o'zgarmaydi - kod ularga nomi bilan tayanadi.
 *
 * Huquqlar faqat rol BIRINCHI marta yaratilganda beriladi - keyin admin
 * Rollar sahifasidan o'zgartira oladi (qaysi rollar bir marta yaratilgani
 * `system_role_seeds` da turadi, o'chirilgan rol qayta paydo bo'lmaydi).
 * Istisno - Super admin: unga har ishga tushishda barcha huquqlar qayta
 * beriladi (yopiq) va u o'chirilmaydi.
 *
 * Yozuv ko'rinishi: 'resurs' - shu bo'limning barcha huquqlari,
 * 'resurs:action1,action2' - faqat sanalganlari.
 *
 * Yangi doimiy rol qo'shish uchun shu massivga yozish yetarli.
 */

export const SUPER_ADMIN = 'Super admin';
export const ADMIN = 'Admin';

/** Bosh sahifa - hammaga */
const HOME = 'dashboard:read';

export interface SystemRole {
  name: string;
  description: string;
  /** 'ALL' - barcha huquqlar */
  grants: string[] | 'ALL';
  /** Huquqlari o'zgartirilmaydi va rol o'chirilmaydi (Super admin) */
  locked?: boolean;
}

export const SYSTEM_ROLES: SystemRole[] = [
  { name: SUPER_ADMIN, description: "To'liq ruxsat - o'zgartirib bo'lmaydi", grants: 'ALL', locked: true },
  { name: ADMIN, description: 'Administrator - Admin va Super admin rolini bera olmaydi', grants: 'ALL' },
  { name: 'Foydalanuvchi', description: "Oddiy foydalanuvchi - faqat bosh sahifa va o'z profili", grants: [HOME] },
];

export const SYSTEM_ROLE_NAMES = SYSTEM_ROLES.map((role) => role.name);
export const isSystemRoleName = (name: string) =>
  SYSTEM_ROLE_NAMES.some((n) => n.toLowerCase() === String(name || '').trim().toLowerCase());
