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
    description: 'Kassada va hamkorlar bilan hisobda dollar qabul qilinadi, kunlik kurs yuritiladi.',
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
    key: 'products',
    title: 'Tovarlar',
    permissions: [
      { key: 'products.view', title: "Ko'rish" },
      { key: 'products.manage', title: "Qo'shish va tahrirlash" },
      { key: 'products.prices', title: "Narxlarni va narx turlarini o'zgartirish" },
      { key: 'products.references', title: "Kategoriya, brend, rang va o'lchamlarni boshqarish" },
    ],
  },
  {
    key: 'receipts',
    title: 'Kirim',
    permissions: [
      { key: 'receipts.view', title: "Kirim hujjatlarini ko'rish" },
      { key: 'receipts.manage', title: 'Qoralama yaratish va tahrirlash' },
      { key: 'receipts.post', title: "O'tkazish, bekor qilish va xarajatlarni o'zgartirish" },
    ],
  },
  {
    key: 'stock',
    title: 'Qoldiq',
    permissions: [
      { key: 'stock.view', title: "Qoldiqni ko'rish" },
      { key: 'stock.cost', title: "Tannarxni ko'rish" },
    ],
  },
  {
    key: 'transfers',
    title: "Ko'chirish",
    permissions: [
      { key: 'transfers.view', title: "Ko'rish" },
      { key: 'transfers.manage', title: "Jo'natish va qabul qilish" },
    ],
  },
  {
    key: 'writeoffs',
    title: 'Hisobdan chiqarish',
    permissions: [
      { key: 'writeoffs.view', title: "Ko'rish" },
      { key: 'writeoffs.manage', title: 'Qoralama yaratish va tahrirlash' },
      { key: 'writeoffs.post', title: "Tasdiqlash (o'tkazish) va bekor qilish" },
    ],
  },
  {
    key: 'counts',
    title: 'Inventarizatsiya',
    permissions: [
      { key: 'counts.view', title: "Ko'rish" },
      { key: 'counts.manage', title: 'Sanash' },
      { key: 'counts.post', title: "Natijani tasdiqlash: farq qoldiqqa o'tadi" },
    ],
  },
  {
    key: 'partners',
    title: 'Yetkazib beruvchilar va hamkorlar',
    permissions: [
      { key: 'partners.view', title: "Ko'rish" },
      { key: 'partners.manage', title: "Qo'shish va tahrirlash" },
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
    permissions: [
      'locations.*',
      'users.*',
      'products.*',
      'receipts.*',
      'stock.*',
      'transfers.*',
      'writeoffs.*',
      'counts.*',
      'partners.*',
      'audit.view',
    ],
  },
  {
    key: 'accountant',
    name: 'Hisobchi',
    description: 'Pul, kartalar, hamkorlar bilan hisob-kitob va hisobotlar.',
    permissions: [
      'locations.view',
      'products.view',
      'receipts.view',
      'stock.*',
      'transfers.view',
      'writeoffs.view',
      'counts.view',
      'partners.view',
      'audit.view',
    ],
  },
  {
    key: 'store_manager',
    name: "Do'kon menejeri",
    description: "O'z do'koni: chegirma va qaytarishni tasdiqlaydi, smenadan pulni qabul qiladi.",
    permissions: [
      'locations.view',
      'users.view',
      'products.view',
      'stock.view',
      'transfers.*',
      'writeoffs.view',
      'writeoffs.manage',
      'counts.view',
      'counts.manage',
    ],
  },
  {
    key: 'cashier',
    name: 'Kassir',
    description: 'Sotadi, qaytaradi, smenani ochadi va yopadi.',
    permissions: ['products.view', 'stock.view'],
  },
  {
    key: 'seller',
    name: 'Sotuvchi',
    description: 'Zalda mijozga tovar topadi; chekda uning nomi turadi.',
    permissions: ['products.view', 'stock.view'],
  },
  {
    key: 'warehouse',
    name: 'Sklad mudiri',
    description: "Kirim, etiketka, ko'chirish va inventarizatsiya.",
    permissions: [
      'locations.view',
      'products.view',
      'products.manage',
      'products.references',
      'receipts.*',
      'stock.view',
      'transfers.*',
      'writeoffs.view',
      'writeoffs.manage',
      'counts.view',
      'counts.manage',
      'partners.view',
    ],
  },
  {
    key: 'partners_manager',
    name: 'Hamkorlar menejeri',
    description: "Hamkorlarga tovar beradi, to'lov qabul qiladi, akt yuboradi.",
    permissions: ['products.view', 'stock.view', 'partners.*'],
  },
]
