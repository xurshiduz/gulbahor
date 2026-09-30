import { useTranslation } from "react-i18next";

/** Sahifadagi qatorlar soni variantlari - hamma jadvalda bir xil */
export const PAGE_SIZES = [30, 50, 100, 200];
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/** 1 … 4 5 6 … 12 ko'rinishidagi sahifa raqamlari */
function pageItems(current: number, total: number): (number | "...")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, "...", total];
  if (current >= total - 2) return [1, "...", total - 2, total - 1, total];
  return [1, "...", current, "...", total];
}

const buttonClass =
  "px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-gray-600 dark:text-gray-300 font-medium transition-colors";

/**
 * Jadval ostidagi panel: sahifadagi qatorlar soni (30 / 50 / 100 / 200),
 * jami soni va sahifalar. `total` - filtrdan keyingi, `overall` - filtrsiz
 * soni (farq qilsa "12 / 340" ko'rinishida chiqadi).
 */
export default function Pagination({ page, pageSize, total, overall, onPageChange, onPageSizeChange }: {
  page: number;
  pageSize: number;
  total: number;
  overall?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label={t("common.page_size")}
          title={t("common.page_size")}
          className="border border-gray-300 dark:border-gray-700 rounded text-sm py-1.5 pl-3 pr-7 mr-4 bg-white dark:bg-gray-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <span className="font-medium">
          {t("common.total", { count: total })}
          {overall !== undefined && overall !== total && (
            <span className="ml-1 font-normal text-gray-400">/ {overall}</span>
          )}
        </span>
      </div>

      <div className="flex gap-1.5">
        <button onClick={() => onPageChange(1)} disabled={page === 1} className={buttonClass}>«</button>
        <button onClick={() => onPageChange(Math.max(page - 1, 1))} disabled={page === 1} className={buttonClass}>‹</button>
        {pageItems(page, totalPages).map((item, index) =>
          item === "..." ? (
            <span key={`gap-${index}`} className="px-2 py-1.5 text-sm text-gray-500">...</span>
          ) : (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                page === item
                  ? "bg-brand-50 text-brand-600 border-brand-200 dark:bg-brand-500/10 dark:border-brand-500/20"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button onClick={() => onPageChange(Math.min(page + 1, totalPages))} disabled={page === totalPages} className={buttonClass}>›</button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className={buttonClass}>»</button>
      </div>
    </div>
  );
}
