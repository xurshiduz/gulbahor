/**
 * What a business can switch on, what a person can be allowed to do, and the
 * ready-made roles a new business starts with. Kept here so the server
 * enforces exactly what the screens show.
 */

export interface ModuleInfo {
  key: string
  title: string
  description: string
  /** Not built yet: the choice is remembered, nothing appears in the UI. */
  ready: boolean
  requires?: string[]
}

export const MODULES: ModuleInfo[] = [
  {
    key: 'usd',
    title: 'Dollar bilan ishlash',
    description: "Kassada va hamkorlar bilan hisobda dollar qabul qilinadi, kunlik kurs yuritiladi.",
    ready: false,
  },
  {
    key: 'rfid',
    title: 'RFID',
    description: 'Har dona alohida kuzatiladi: etiketka chop etish, RFID bilan sotish, sanash va darvoza.',
    ready: false,
  },
  {
    key: 'partners',
    title: 'Hamkorlar',
    description: "Boshqa sotuvchilarga qarzga tovar berish, to'lovlar, akt-sverka, kredit limiti.",
    ready: false,
  },
  {
    key: 'consignment',
    title: 'Konsignatsiya',
    description: "Tovar sotilgandan keyin to'lanadi, sotilmagani qaytariladi.",
    ready: false,
    requires: ['partners'],
  },
  {
    key: 'cards',
    title: 'Kartalar nazorati',
    description: "Bank xabarlari Telegram'dan o'qiladi: kartaga pul tushgani sotuvga bog'lanadi.",
    ready: false,
  },
  {
    key: 'terminal',
    title: 'Bank terminali',
    description: "Terminal to'lovlari bank tushumi bilan solishtiriladi, komissiya hisobga olinadi.",
    ready: false,
  },
  {
    key: 'landed_cost',
    title: 'Import xarajatlari',
    description: "Yo'l, bojxona va boshqa xarajatlar tovar tannarxiga taqsimlanadi.",
    ready: false,
  },
  {
    key: 'loyalty',
    title: 'Keshbek',
    description: "Mijoz telefon raqami bo'yicha taniladi, xariddan ball oladi, chek Telegram'ga keladi.",
    ready: false,
  },
  {
    key: 'retail_credit',
    title: 'Chakana mijozga qarz',
    description: 'Tanish mijozga qarzga berish, limit bilan.',
    ready: false,
  },
  {
    key: 'payroll',
    title: 'Xodimlar maoshi',
    description: 'Oylik, sotuvdan foiz, bonus, jarima va oylik vedomost.',
    ready: false,
  },
  {
    key: 'shareholders',
    title: 'Sheriklar',
    description: 'Sheriklarning foydadagi ulushi va biznesdan olgan pullari.',
    ready: false,
  },
  {
    key: 'fiscal',
    title: 'Onlayn-kassa',
    description: 'Har sotuv soliqqa ulangan kassaga uzatiladi, chekda soliq QR kodi chiqadi.',
    ready: false,
  },
]

export const MODULE_KEYS = MODULES.map((module) => module.key)

export interface PermissionInfo {
  key: string
  title: string
}

export interface PermissionGroup {
  key: string
  title: string
  /** Shown only when this module is on. Absent means always shown. */
  module?: string
  permissions: PermissionInfo[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'locations',
    title: "Do'kon va skladlar",
    permissions: [
      { key: 'locations.view', title: "Ko'rish" },
      { key: 'locations.manage', title: "Qo'shish va tahrirlash" },
    ],
  },
  {
    key: 'users',
    title: 'Xodimlar',
    permissions: [
      { key: 'users.view', title: "Ko'rish" },
      { key: 'users.manage', title: "Qo'shish, tahrirlash, bloklash, parolni yangilash" },
    ],
  },
  {
    key: 'roles',
    title: 'Rollar',
    permissions: [{ key: 'roles.manage', title: 'Rollar va ruxsatlarni boshqarish' }],
  },
  {
    key: 'settings',
    title: 'Sozlamalar',
    permissions: [{ key: 'settings.manage', title: 'Biznes sozlamalari va modullar' }],
  },
  {
    key: 'audit',
    title: "O'zgarishlar tarixi",
    permissions: [{ key: 'audit.view', title: "Ko'rish" }],
  },
]

export const PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((item) => item.key))

/** Everything, including what later versions add. Only the owner role holds it. */
export const ALL_PERMISSIONS = '*'

/** Does a set of granted permissions ("*", "users.*", "users.view") cover `permission`? */
export function hasPermission(granted: Iterable<string>, permission: string): boolean {
  const group = `${permission.split('.')[0]}.*`
  for (const item of granted) {
    if (item === ALL_PERMISSIONS || item === permission || item === group) {
      return true
    }
  }
  return false
}

export interface RoleTemplate {
  key: string
  name: string
  description: string
  permissions: string[]
  /** The owner role cannot be edited or removed. */
  system?: boolean
}

export const OWNER_ROLE_KEY = 'owner'

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: OWNER_ROLE_KEY,
    name: 'Egasi',
    description: 'Hamma narsani boshqaradi va tasdiqlaydi.',
    permissions: [ALL_PERMISSIONS],
    system: true,
  },
  {
    key: 'manager',
    name: 'Boshqaruvchi',
    description: "Egasining o'rinbosari: do'konlar va xodimlarga qaraydi.",
    permissions: ['locations.*', 'users.*', 'audit.view'],
  },
  {
    key: 'accountant',
    name: 'Hisobchi',
    description: 'Pul, kartalar, hamkorlar bilan hisob-kitob va hisobotlar.',
    permissions: ['locations.view', 'audit.view'],
  },
  {
    key: 'store_manager',
    name: "Do'kon menejeri",
    description: "O'z do'koni: chegirma va qaytarishni tasdiqlaydi, smenadan pulni qabul qiladi.",
    permissions: ['locations.view', 'users.view'],
  },
  {
    key: 'cashier',
    name: 'Kassir',
    description: 'Sotadi, qaytaradi, smenani ochadi va yopadi.',
    permissions: [],
  },
  {
    key: 'seller',
    name: 'Sotuvchi',
    description: 'Zalda mijozga tovar topadi; chekda uning nomi turadi.',
    permissions: [],
  },
  {
    key: 'warehouse',
    name: 'Sklad mudiri',
    description: "Kirim, etiketka, ko'chirish va inventarizatsiya.",
    permissions: ['locations.view'],
  },
  {
    key: 'partners_manager',
    name: 'Hamkorlar menejeri',
    description: "Hamkorlarga tovar beradi, to'lov qabul qiladi, akt yuboradi.",
    permissions: [],
  },
]
