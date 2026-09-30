import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, ChevronDown, ChevronRight, ImageOff, Layers, PiggyBank, RefreshCw, Search, Tag, TrendingUp } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../../components/common/Pagination";
import { useAuth } from "../../context/AuthContext";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { localized, type LocalizedName } from "../../utils/localized";

/**
 * Ombordagi qoldiq.
 *
 * Qoldiq tasdiqlangan kirim va chiqim hujjatlaridan hisoblanadi. Filial
 * tanlansa uning hamma omborlari, omborxona tanlansa faqat o'shasi,
 * hech narsa tanlanmasa - umumiy qoldiq.
 *
 * Kartochkalar: SKU (tovar turlari), dona, kirim summasi (qoldiq o'rtacha
 * kirim narxida), sotuv summasi (sotuv narxida), kutilayotgan foyda.
 */

interface StockRow {
  materialId: string;
  material: {
    id: string; name: string; sku: string | null; barcode: string | null;
    unit: { shortName: LocalizedName } | null;
    category: { name: LocalizedName } | null;
    brand: { name: string } | null;
    color: { name: LocalizedName; hex: string | null } | null;
    size: { name: string } | null;
    images: { url: string; isMain: boolean }[];
  } | null;
  inQuantity: number;
  outQuantity: number;
  quantity: number;
  avgCost: number;
  costAmount: number;
  salePrice: number;
  saleAmount: number;
  profit: number;
  salePriceKnown: boolean;
  soldAmount: number;
  warehouses: { warehouseId: string | null; name: string | null; branchName: string | null; quantity: number }[];
}

interface Totals {
  skuCount: number; quantity: number; costAmount: number; saleAmount: number; profit: number;
  margin: number | null; negativeCount: number; unknownPriceCount: number; soldAmount: number;
}

interface Options {
  branches: { id: string; name: string; isActive?: boolean }[];
  warehouses: { id: string; name: string; branchId: string; isActive?: boolean }[];
}

type SortKey = "name" | "quantity" | "costAmount" | "saleAmount" | "profit";
type StockFilter = "in_stock" | "all" | "negative" | "no_price";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const fmtMoney = (value: number) => money.format(Math.round(value || 0));
const fmtQty = (value: number) => qty.format(value || 0);

const selectClass =
  "h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const th = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 whitespace-nowrap";
const td = "px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300";

function StatCard({ icon, label, value, unit, hint, tone = "default" }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; hint?: React.ReactNode;
  tone?: "default" | "brand" | "green" | "amber" | "red";
}) {
  const tones = {
    default: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
    green: "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</span>
        {unit && <span className="text-sm text-gray-500 dark:text-gray-400">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div>}
    </div>
  );
}

export default function Stock() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { token, logout } = useAuth();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [options, setOptions] = useState<Options>({ branches: [], warehouses: [] });
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("in_stock");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "quantity", desc: true });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (!token) return;
    fetch("/api/stock/options", { headers: auth })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setOptions(data); })
      .catch(() => { /* filtr bo'sh qoladi */ });
  }, [token, auth]);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError("");
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (warehouseId) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/stock?${params}`, { headers: auth });
      if (res.status === 401) return logout();
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
      setRows(data.rows);
      setTotals(data.totals);
    } catch (err: any) {
      setLoadError(err.message || t("common.load_error"));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, warehouseId, auth]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const branchWarehouses = options.warehouses.filter((warehouse) => !branchId || warehouse.branchId === branchId);

  const query = normalizeSearch(search);
  const filtered = useMemo(() => {
    const list = rows.filter((row) => {
      if (stockFilter === "in_stock" && row.quantity <= 0) return false;
      if (stockFilter === "negative" && row.quantity >= 0) return false;
      if (stockFilter === "no_price" && (row.quantity <= 0 || row.salePriceKnown)) return false;
      if (!query) return true;
      const m = row.material;
      return normalizeSearch([m?.name, m?.sku, m?.barcode, m?.brand?.name, m?.size?.name, localized(m?.category?.name, lang), localized(m?.color?.name, lang)].filter(Boolean).join(" ")).includes(query);
    });
    const value = (row: StockRow) => (sort.key === "name" ? row.material?.name || "" : row[sort.key]);
    return list.sort((a, b) => {
      const x = value(a), y = value(b);
      const result = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.desc ? -result : result;
    });
  }, [rows, stockFilter, query, sort, lang]);

  useEffect(() => { setPage(1); }, [query, stockFilter, branchId, warehouseId]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: SortKey) => setSort((prev) => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: key !== "name" }));
  const toggleExpanded = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Bitta ombor tanlangan bo'lsa omborlar bo'yicha ochish ma'nosiz
  const canExpand = !warehouseId;

  const SortHeader = ({ label, sortKey, right }: { label: string; sortKey: SortKey; right?: boolean }) => (
    <th className={`${th} ${right ? "text-right" : ""}`}>
      <button onClick={() => toggleSort(sortKey)} className={`inline-flex items-center gap-1 uppercase hover:text-gray-900 dark:hover:text-white ${right ? "flex-row-reverse" : ""}`}>
        {label}
        {sort.key === sortKey && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );

  const scopeName = warehouseId
    ? options.warehouses.find((w) => w.id === warehouseId)?.name
    : branchId ? options.branches.find((b) => b.id === branchId)?.name : t("stock.all_scope");

  return (
    <>
      <PageMeta title={`${t("modules.stock.title")} | Gulbahor`} description={t("modules.stock.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-950 w-full">
        {/* Yuqori panel: filtrlar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-6 shrink-0">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-white/90">{t("modules.stock.title")}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{scopeName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={t("stock.branch")} value={branchId} onChange={(e) => { setBranchId(e.target.value); setWarehouseId(""); }} className={selectClass}>
              <option value="">{t("stock.all_branches")}</option>
              {options.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select aria-label={t("stock.warehouse")} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={selectClass}>
              <option value="">{branchId ? t("stock.all_branch_warehouses") : t("stock.all_warehouses")}</option>
              {branchWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
            <button onClick={load} title={t("stock.refresh")} aria-label={t("stock.refresh")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="space-y-4 p-4 md:p-6">
            {/* Kartochkalar */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard icon={<Layers className="h-4 w-4" />} label={t("stock.card_sku")} value={fmtQty(totals?.skuCount || 0)} unit={t("stock.sku_unit")} hint={t("stock.card_sku_hint")} />
              <StatCard icon={<Boxes className="h-4 w-4" />} label={t("stock.card_quantity")} value={fmtQty(totals?.quantity || 0)} unit={t("stock.pcs")} hint={t("stock.card_quantity_hint")} tone="brand" />
              <StatCard icon={<Tag className="h-4 w-4" />} label={t("stock.card_cost")} value={fmtMoney(totals?.costAmount || 0)} unit={t("currencies.sum")} hint={t("stock.card_cost_hint")} tone="amber" />
              <StatCard
                icon={<PiggyBank className="h-4 w-4" />} label={t("stock.card_sale")} value={fmtMoney(totals?.saleAmount || 0)} unit={t("currencies.sum")} tone="green"
                hint={totals?.unknownPriceCount
                  ? <button onClick={() => setStockFilter("no_price")} className="text-amber-600 hover:underline dark:text-amber-400">{t("stock.unknown_price", { count: totals.unknownPriceCount })}</button>
                  : t("stock.card_sale_hint")}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />} label={t("stock.card_profit")} value={fmtMoney(totals?.profit || 0)} unit={t("currencies.sum")}
                tone={(totals?.profit || 0) < 0 ? "red" : "green"}
                hint={totals?.margin !== null && totals?.margin !== undefined ? t("stock.margin", { value: totals.margin }) : t("stock.card_profit_hint")}
              />
            </div>

            {!!totals?.negativeCount && (
              <button
                onClick={() => setStockFilter("negative")}
                className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("stock.negative_warning", { count: totals.negativeCount })}
              </button>
            )}

            {/* Jadval */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700" role="tablist">
                  {(["in_stock", "all", "negative", "no_price"] as StockFilter[]).map((key) => (
                    <button
                      key={key} role="tab" aria-selected={stockFilter === key} onClick={() => setStockFilter(key)}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${stockFilter === key ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}
                    >
                      {t(`stock.filter_${key}`)}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("stock.search")}
                    className="h-8 w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-72"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      {canExpand && <th className={`${th} w-8`} />}
                      <SortHeader label={t("inbounds.product")} sortKey="name" />
                      <th className={`${th} text-right`}>{t("stock.in")}</th>
                      <th className={`${th} text-right`}>{t("stock.out")}</th>
                      <SortHeader label={t("stock.balance")} sortKey="quantity" right />
                      <th className={`${th} text-right`}>{t("stock.avg_cost")}</th>
                      <SortHeader label={t("stock.cost_amount")} sortKey="costAmount" right />
                      <th className={`${th} text-right`}>{t("stock.sale_price")}</th>
                      <SortHeader label={t("stock.sale_amount")} sortKey="saleAmount" right />
                      <SortHeader label={t("stock.profit")} sortKey="profit" right />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {isLoading && !rows.length ? (
                      <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
                    ) : loadError ? (
                      <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-red-500">{loadError}</td></tr>
                    ) : pageRows.length === 0 ? (
                      <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-500">{rows.length ? t("common.nothing_found") : t("stock.empty")}</td></tr>
                    ) : (
                      pageRows.map((row) => {
                        const m = row.material;
                        const image = m?.images?.find((img) => img.isMain) || m?.images?.[0];
                        const isOpen = expanded.has(row.materialId);
                        const details = [m?.size?.name, localized(m?.color?.name, lang), m?.brand?.name].filter(Boolean).join(" · ");
                        return (
                          <Fragment key={row.materialId}>
                            <tr className="hover:bg-blue-50/40 dark:hover:bg-blue-900/10">
                              {canExpand && (
                                <td className="pl-3 pr-0 py-2.5">
                                  {row.warehouses.length > 0 && (
                                    <button
                                      onClick={() => toggleExpanded(row.materialId)}
                                      aria-label={t("stock.by_warehouse")} title={t("stock.by_warehouse")}
                                      className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                                    >
                                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                  )}
                                </td>
                              )}
                              <td className={td}>
                                <span className="flex items-center gap-3">
                                  {image ? (
                                    <img src={image.url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-700" />
                                  ) : (
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-300 dark:border-gray-600">
                                      <ImageOff className="h-3.5 w-3.5" />
                                    </span>
                                  )}
                                  <span className="min-w-0">
                                    <span className="block font-medium text-gray-900 dark:text-white">{m?.name || "—"}</span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{[details, m?.sku, m?.barcode].filter(Boolean).join("  ·  ") || "—"}</span>
                                  </span>
                                </span>
                              </td>
                              <td className={`${td} text-right tabular-nums text-gray-500`}>{fmtQty(row.inQuantity)}</td>
                              <td className={`${td} text-right tabular-nums text-gray-500`}>{fmtQty(row.outQuantity)}</td>
                              <td className={`${td} text-right font-semibold tabular-nums ${row.quantity < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                                {fmtQty(row.quantity)} <span className="text-xs font-normal text-gray-400">{localized(m?.unit?.shortName, lang)}</span>
                              </td>
                              <td className={`${td} text-right tabular-nums`}>{fmtMoney(row.avgCost)}</td>
                              <td className={`${td} text-right tabular-nums font-medium text-gray-900 dark:text-white`}>{fmtMoney(row.costAmount)}</td>
                              <td className={`${td} text-right tabular-nums`}>
                                {row.salePriceKnown ? fmtMoney(row.salePrice) : <span className="text-xs text-amber-600 dark:text-amber-400">{t("stock.no_price")}</span>}
                              </td>
                              <td className={`${td} text-right tabular-nums font-medium text-gray-900 dark:text-white`}>{row.salePriceKnown ? fmtMoney(row.saleAmount) : "—"}</td>
                              <td className={`${td} text-right tabular-nums ${row.profit < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                {row.salePriceKnown ? fmtMoney(row.profit) : "—"}
                              </td>
                            </tr>
                            {canExpand && isOpen && row.warehouses.map((place) => (
                              <tr key={`${row.materialId}-${place.warehouseId}`} className="bg-gray-50/70 dark:bg-gray-800/30">
                                <td />
                                <td className={`${td} pl-14 text-xs`} colSpan={3}>
                                  <span className="font-medium text-gray-700 dark:text-gray-200">{place.name || t("stock.no_warehouse")}</span>
                                  {place.branchName && <span className="ml-2 text-gray-400">{place.branchName}</span>}
                                </td>
                                <td className={`${td} text-right text-xs font-semibold tabular-nums ${place.quantity < 0 ? "text-red-600" : ""}`}>{fmtQty(place.quantity)}</td>
                                <td colSpan={5} />
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={currentPage}
                pageSize={pageSize}
                total={filtered.length}
                overall={rows.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
