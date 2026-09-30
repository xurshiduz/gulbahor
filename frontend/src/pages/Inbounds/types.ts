import type { PickedMaterial } from "../../components/documents/ProductSearchModal";

export type InboundType = "PURCHASE" | "RETURN" | "EXCHANGE";
export type InboundStatus = "DRAFT" | "APPROVED";

export const INBOUND_TYPES: InboundType[] = ["PURCHASE", "RETURN", "EXCHANGE"];
export const isReturnType = (type: InboundType) => type !== "PURCHASE";

/** Turlarning rangli belgisi - ro'yxat va forma sarlavhasida */
export const TYPE_STYLE: Record<InboundType, string> = {
  PURCHASE: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  RETURN: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  EXCHANGE: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
};

export const STATUS_STYLE: Record<InboundStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  APPROVED: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
};

/** Sotuv hujjati qatori - qaytarish mumkin bo'lgan soni bilan */
export interface SaleItem {
  id: string;
  materialId: string;
  material: PickedMaterial;
  quantity: number;
  price: number;
  returned: number;
  returnable: number;
}

export interface SaleDocument {
  id: string;
  documentNumber: string;
  documentDate: string;
  customer: { id: string; name: string; phone: string | null } | null;
  items: SaleItem[];
}

/** Formadagi qator. `quantity` va `price` - matn: foydalanuvchi yozayotgan holat */
export interface FormItem {
  key: string;
  materialId: string;
  material: PickedMaterial;
  quantity: string;
  price: string;
  /** Qaytarish / almashinuv: qaysi sotuv qatoridan */
  sourceOutboundItemId?: string | null;
  saleNumber?: string | null;
}

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
export const formatMoney = (value: number) => money.format(value || 0);
export const formatQuantity = (value: number) => quantity.format(value || 0);

/** "12 650,5" yoki "12650.5" -> 12650.5; noto'g'ri bo'lsa NaN */
export const parseNumber = (value: string | number) =>
  typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
