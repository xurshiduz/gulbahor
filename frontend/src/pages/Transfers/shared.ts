export type TransferStatus = "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";

export const STATUS_STYLE: Record<TransferStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  SENT: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  RECEIVED: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  CANCELLED: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

const qty = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
export const fmtQty = (value: number | null | undefined) => qty.format(value || 0);

/** Skaner kodlari -> tovar (server javobi) */
export interface Resolved {
  code: string;
  kind: "epc" | "barcode";
  epc?: string;
  status: "ok" | "unknown" | "not_found";
  material: any | null;
}
