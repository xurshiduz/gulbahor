import {
  LayoutDashboard, UserCircle, ShieldCheck, Building2, GitBranch, Warehouse, Layers, Tag, Ruler, Palette, Shirt, Globe, MapPin,
  Coins, TrendingUp, CreditCard, Receipt, Users, Truck, Package, Gift, Percent, BadgePercent, RefreshCw, ReceiptText, PackagePlus, PackageMinus, Wallet,
} from "lucide-react";

export interface ModuleItem {
  /** Tarjima kaliti: modules.<key>.title va modules.<key>.desc */
  key: string;
  path: string;
  /** Ko'rish huquqi shu resurs bo'yicha tekshiriladi. Bo'sh bo'lsa - hammaga ochiq */
  resource?: string;
  /** Aniq amal - bo'lsa `action:resource` tekshiriladi */
  action?: string;
  icon: React.ReactNode;
  color: string;
}

/**
 * Tizim bo'limlari - Bosh sahifadagi "Modullar" bo'limi, yuqoridagi
 * qidiruv oynasi (Ctrl+K) va sahifa huquqini tekshiruvchi PermissionGate
 * shu ro'yxatdan foydalanadi.
 *
 * Yangi bo'lim qo'shish: shu yerga yozing, layout/AppSidebar.tsx ga menyu
 * punktini, App.tsx ga yo'lni, locales/*.json ga modules.<key> tarjimasini
 * va backenddagi permissions.service.ts ga shu `resource` ni qo'shing.
 */
export const MODULES: ModuleItem[] = [
  { key: "home", path: "/", icon: <LayoutDashboard />, color: "bg-brand-500" },
  { key: "users", path: "/users", resource: "users", icon: <UserCircle />, color: "bg-violet-500" },
  { key: "roles", path: "/roles", resource: "roles", icon: <ShieldCheck />, color: "bg-emerald-600" },

  // Ma'muriyat
  { key: "organizations", path: "/organizations", resource: "organizations", icon: <Building2 />, color: "bg-slate-600" },
  { key: "branches", path: "/branches", resource: "branches", icon: <GitBranch />, color: "bg-blue-500" },
  { key: "warehouses", path: "/warehouses", resource: "warehouses", icon: <Warehouse />, color: "bg-amber-600" },

  // Kontragentlar
  { key: "customers", path: "/customers", resource: "customers", icon: <Users />, color: "bg-rose-500" },
  { key: "suppliers", path: "/suppliers", resource: "suppliers", icon: <Truck />, color: "bg-orange-600" },

  // Hujjatlar
  { key: "inbounds", path: "/inbounds", resource: "inbound-documents", icon: <PackagePlus />, color: "bg-amber-500" },

  { key: "outbounds", path: "/outbounds", resource: "outbound-documents", icon: <PackageMinus />, color: "bg-emerald-600" },

  // Marketing vositalari
  { key: "giftCertificates", path: "/gift-certificates", resource: "gift-certificates", icon: <Gift />, color: "bg-pink-600" },
  { key: "discountPromotions", path: "/promotions/discounts", resource: "promotions", icon: <Percent />, color: "bg-red-500" },
  { key: "giftPromotions", path: "/promotions/gifts", resource: "promotions", icon: <BadgePercent />, color: "bg-fuchsia-600" },
  { key: "carouselPromotions", path: "/promotions/carousel", resource: "promotions", icon: <RefreshCw />, color: "bg-violet-600" },
  { key: "receiptPromotions", path: "/promotions/receipt", resource: "promotions", icon: <ReceiptText />, color: "bg-amber-600" },

  // Buhgalteriya
  { key: "payments", path: "/payments", resource: "payments", icon: <Wallet />, color: "bg-teal-600" },
  { key: "currencies", path: "/currencies", resource: "currencies", icon: <Coins />, color: "bg-yellow-600" },
  { key: "currencyRates", path: "/currency-rates", resource: "currency-rates", icon: <TrendingUp />, color: "bg-emerald-500" },
  { key: "paymentTypes", path: "/payment-types", resource: "payment-types", icon: <CreditCard />, color: "bg-green-600" },
  { key: "expenseTypes", path: "/expense-types", resource: "expense-types", icon: <Receipt />, color: "bg-red-500" },

  { key: "materials", path: "/materials", resource: "materials", icon: <Package />, color: "bg-blue-600" },

  // Material ma'lumotlari
  { key: "categories", path: "/categories", resource: "product-categories", icon: <Layers />, color: "bg-sky-500" },
  { key: "brands", path: "/brands", resource: "product-brands", icon: <Tag />, color: "bg-cyan-600" },
  { key: "units", path: "/units", resource: "product-units", icon: <Ruler />, color: "bg-teal-500" },
  { key: "colors", path: "/colors", resource: "colors", icon: <Palette />, color: "bg-pink-500" },
  { key: "sizes", path: "/sizes", resource: "sizes", icon: <Shirt />, color: "bg-indigo-500" },
  { key: "countries", path: "/countries", resource: "countries", icon: <Globe />, color: "bg-green-600" },
  { key: "regions", path: "/regions", resource: "regions", icon: <MapPin />, color: "bg-orange-500" },
];

/**
 * Qidiruv uchun matnni soddalashtiradi: registr va o'zbekcha apostroflar
 * ("o'lchov" / "oʻlchov" / "olchov") farq qilmasin.
 */
export function normalizeSearch(value: string) {
  return (value || "")
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, "")
    .trim();
}
