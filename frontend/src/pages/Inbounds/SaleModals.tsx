import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { FileText, Search, X } from "lucide-react";
import Button from "../../components/ui/button/Button";
import { materialDetails } from "../../components/documents/ProductSearchModal";
import { errorMessage, readJson } from "../../utils/api";
import { formatMoney, formatQuantity, parseNumber, type SaleDocument, type SaleItem } from "./types";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

/**
 * Sotuv (chiqim) hujjatidan qaytariladigan tovarlarni tanlash.
 *
 * Chek raqami yoziladi (yoki mijozning sotuvlari ro'yxatidan tanlab
 * kelinadi), hujjat qatorlari ochiladi va har bir tovar uchun nechta
 * qaytarilishi kiritiladi. Qaytarish mumkin bo'lgan son - sotilgani minus
 * avval qaytarilgani; undan ortig'i qabul qilinmaydi.
 */
export function SaleItemsModal({ token, excludeDocumentId, initialNumber, customerId, current, onAdd, onClose }: {
  token: string | null;
  /** Tahrirlanayotgan kirim hujjati - uning o'z soni "qaytarilgan"ga qo'shilmaydi */
  excludeDocumentId?: string;
  /** Ro'yxatdan tanlab kelingan chek raqami - darhol ochiladi */
  initialNumber?: string;
  /** Hujjatda tanlangan mijoz - boshqa mijozning cheki qabul qilinmaydi */
  customerId?: string;
  /** Hujjatda allaqachon bor sonlar: { sotuvQatoriId: soni } */
  current: Record<string, string>;
  onAdd: (sale: SaleDocument, picked: { item: SaleItem; quantity: number }[]) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [number, setNumber] = useState(initialNumber || "");
  const [sale, setSale] = useState<SaleDocument | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async (explicit?: string) => {
    const value = (explicit ?? number).trim();
    if (!value) return;
    setIsLoading(true);
    setError("");
    setSale(null);
    try {
      const params = excludeDocumentId ? `?exclude=${excludeDocumentId}` : "";
      const res = await fetch(`/api/outbound-documents/by-number/${encodeURIComponent(value)}${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("inbounds.sale_not_found")));
      if (customerId && data.customer && data.customer.id !== customerId) {
        throw new Error(t("inbounds.sale_other_customer", { name: data.customer.name }));
      }
      setSale(data);
      // Hujjatda allaqachon tanlangan sonlar ko'rinib turadi
      setSelection(Object.fromEntries((data.items as SaleItem[]).map((item) => [item.id, current[item.id] || ""])));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialNumber) search(initialNumber);
    else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picked = (sale?.items || [])
    .map((item) => ({ item, quantity: parseNumber(selection[item.id] || "") }))
    .filter((row) => row.quantity > 0);
  const total = picked.reduce((sum, row) => sum + row.quantity * row.item.price, 0);
  const overLimit = picked.find((row) => row.quantity > row.item.returnable);

  return (
    <div className="fixed inset-0 z-[100000] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-14">
      <div className="flex max-h-[84vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("inbounds.sale_title")}</h3>
          <button onClick={onClose} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
            <input
              ref={inputRef}
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={t("inbounds.sale_number_placeholder")}
              className={`${inputClass} font-mono`}
            />
            <Button size="sm" disabled={isLoading || !number.trim()} className="h-10 shrink-0 py-0">
              <Search className="h-4 w-4" /> {t("inbounds.find")}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm font-medium text-red-500">{error}</p>}
          {sale && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              <b className="font-mono">{sale.documentNumber}</b> · {dayjs(sale.documentDate).format("DD.MM.YYYY")}
              {sale.customer && <> · {sale.customer.name}</>}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-gray-500">{t("common.loading")}</p>
          ) : !sale ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">{t("inbounds.sale_hint")}</p>
          ) : (
            <table className="min-w-full">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <th className="px-5 py-2.5">{t("inbounds.product")}</th>
                  <th className="px-3 py-2.5 text-right">{t("inbounds.sold")}</th>
                  <th className="px-3 py-2.5 text-right">{t("inbounds.returnable")}</th>
                  <th className="px-3 py-2.5 text-right">{t("inbounds.price")}</th>
                  <th className="px-5 py-2.5 text-right">{t("inbounds.return_quantity")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {sale.items.map((item) => {
                  const value = parseNumber(selection[item.id] || "");
                  const invalid = value > item.returnable;
                  return (
                    <tr key={item.id} className={item.returnable <= 0 ? "opacity-50" : ""}>
                      <td className="px-5 py-2.5 text-sm">
                        <span className="block font-medium text-gray-900 dark:text-white">{item.material.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {[materialDetails(item.material, i18n.language), item.material.barcode].filter(Boolean).join("  ·  ")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600 dark:text-gray-300">{formatQuantity(item.quantity)}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        {formatQuantity(item.returnable)}
                        {item.returned > 0 && <span className="block text-[11px] font-normal text-gray-400">{t("inbounds.already_returned", { count: item.returned })}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatMoney(item.price)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={item.returnable <= 0}
                          value={selection[item.id] || ""}
                          onChange={(e) => setSelection({ ...selection, [item.id]: e.target.value.replace(/[^\d.,]/g, "") })}
                          placeholder="0"
                          className={`h-9 w-24 rounded-lg border bg-transparent px-2 text-right text-sm focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white ${
                            invalid ? "border-red-400 focus:ring-red-500/20" : "border-gray-300 focus:ring-brand-500/20 dark:border-gray-700"
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {overLimit
              ? <span className="font-medium text-red-500">{t("inbounds.over_limit", { name: overLimit.item.material.name, count: overLimit.item.returnable })}</span>
              : sale && <>{t("inbounds.total")}: <b>{formatMoney(total)}</b></>}
          </span>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>{t("common.cancel")}</Button>
            <Button size="sm" disabled={!sale || !picked.length || !!overLimit} onClick={() => sale && onAdd(sale, picked)}>
              {t("inbounds.add_to_document")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SaleSummary {
  id: string;
  documentNumber: string;
  documentDate: string;
  itemsCount: number;
  totalAmount: number;
  returnable: number;
  materials: string[];
}

/**
 * Mijozning sotuv hujjatlari - chek raqami esda bo'lmasa shu ro'yxatdan
 * tanlanadi. Qidiruv tovar nomi yoki shtrix-kodi bo'yicha: o'sha tovar
 * sotilgan cheklar qoladi (shtrix-kodni skanerlab topish mumkin).
 */
export function CustomerSalesModal({ token, customerId, customerName, onPick, onClose }: {
  token: string | null;
  customerId: string;
  customerName: string;
  onPick: (documentNumber: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SaleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ contractorId: customerId });
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/outbound-documents/for-return?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (!cancelled) { setError(err.message); setRows([]); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, query ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, customerId, token, t]);

  return (
    <div className="fixed inset-0 z-[100000] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-14">
      <div className="flex max-h-[84vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("inbounds.customer_sales")}</h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{customerName}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("inbounds.customer_sales_search")}
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {error ? (
            <p className="py-10 text-center text-sm text-red-500">{error}</p>
          ) : isLoading && !rows.length ? (
            <p className="py-10 text-center text-sm text-gray-500">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">{t("inbounds.customer_sales_empty")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    onClick={() => onPick(row.documentNumber)}
                    disabled={row.returnable <= 0}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/5"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                        <span className="font-mono">{row.documentNumber}</span>
                        <span className="ml-2 font-normal text-gray-500">{dayjs(row.documentDate).format("DD.MM.YYYY")}</span>
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {row.materials.join(", ")}{row.itemsCount > row.materials.length ? ` +${row.itemsCount - row.materials.length}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{formatMoney(row.totalAmount)}</span>
                      <span className={`block text-xs ${row.returnable > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                        {row.returnable > 0 ? t("inbounds.returnable_count", { count: row.returnable }) : t("inbounds.fully_returned")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
