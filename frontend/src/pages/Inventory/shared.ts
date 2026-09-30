export type InventoryStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface Progress { counted: number; skuCount: number; unknown: number; lastScanAt: string | null }

export interface Totals {
  positions: number; matched: number; expected: number; counted: number;
  shortageQty: number; surplusQty: number; shortageCost: number; surplusCost: number;
  shortageSale: number; surplusSale: number; netCost: number; accuracy: number;
}

export interface Inventory {
  id: string; number: string; status: InventoryStatus; startDate: string; endDate: string; description: string | null;
  branchId: string; warehouseId: string;
  branch: { id: string; name: string } | null; warehouse: { id: string; name: string } | null;
  responsible: { id: string; name: string } | null; createdBy: { id: string; name: string } | null; finishedBy: { id: string; name: string } | null;
  startedAt: string | null; finishedAt: string | null; createdAt: string;
  progress: Progress; totals?: Totals | null;
}

export const STATUS_STYLE: Record<InventoryStatus, string> = {
  PLANNED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  IN_PROGRESS: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  COMPLETED: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  CANCELLED: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

const qty = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const fmtQty = (value: number) => qty.format(value || 0);
export const fmtMoney = (value: number) => money.format(Math.round(value || 0));
