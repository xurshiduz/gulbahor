import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  ArrowDownRight, ArrowUpRight, Banknote, ChevronRight, Home as HomeIcon, Loader2, Package, Receipt, RefreshCw, RotateCcw, ShoppingBag, TrendingUp, Wallet,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { errorMessage, readJson } from "../../utils/api";
import { localized, type LocalizedName } from "../../utils/localized";

/**
 * Rahbar hisoboti: butun kompaniya bo'yicha savdo, foyda, harajat.
 *
 * Kompaniya -> filial -> ombor -> kategoriya -> tovar: qatorni bosib ichiga
 * kiriladi, yuqoridagi yo'l (breadcrumb) orqali qaytiladi. Har darajada
 * kunlar, kassirlar, kategoriyalar yoki tovarlar kesimiga o'tish mumkin.
 */

type GroupBy = "branch" | "warehouse" | "category" | "material" | "day" | "cashier";
interface Metrics {
  revenue: number; returns: number; netRevenue: number; qty: number; checks: number; avgCheck: number;
  cost: number; grossProfit: number; margin: number | null; expenses: number | null; netProfit: number | null; income: number | null;
}
interface Row extends Metrics { key: string | null; name: string | LocalizedName | null; extra: any }
interface Report {
  period: { from: string; to: string; previous: { from: string; to: string } };
  groupBy: GroupBy; totals: Metrics; previousTotals: Metrics; rows: Row[];
  trend: { day: string; revenue: number; profit: number; checks: number }[];
  scope: Record<"branch" | "warehouse" | "category" | "material" | "cashier", { id: string; name: any } | null>;
}
interface Drill { branchId?: string; warehouseId?: string; categoryId?: string; cashierId?: string }

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const fmt = (value: number | null | undefined) => money.format(Math.round(value || 0));

/** Katta summalar kartochkada qisqa: 12,5 mln */
function short(value: number, t: (key: string, o?: any) => string) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1).replace(".", ",")} ${t("exec.bn")}`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace(".", ",")} ${t("exec.mln")}`;
  return fmt(value);
}

const PRESETS = [
  { key: "today", range: () => [dayjs(), dayjs()] },
  { key: "yesterday", range: () => [dayjs().subtract(1, "day"), dayjs().subtract(1, "day")] },
  { key: "week", range: () => [dayjs().subtract(6, "day"), dayjs()] },
  { key: "month", range: () => [dayjs().startOf("month"), dayjs()] },
  { key: "last_month", range: () => [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
  { key: "year", range: () => [dayjs().startOf("year"), dayjs()] },
] as const;

/** Keyingi daraja: kompaniya -> filial -> ombor -> kategoriya -> tovar */
function nextLevel(drill: Drill): GroupBy {
  if (drill.cashierId) return "material";
  if (!drill.branchId) return "branch";
  if (!drill.warehouseId) return "warehouse";
  if (!drill.categoryId) return "category";
  return "material";
}

function Change({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  const { t } = useTranslation();
  if (!before) return <span className="text-xs text-gray-400">{t("exec.no_compare")}</span>;
  const change = ((now - before) / Math.abs(before)) * 100;
  const good = invert ? change <= 0 : change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
      {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

function Kpi({ icon, tone, label, value, sub, change }: { icon: React.ReactNode; tone: string; label: string; value: string; sub?: React.ReactNode; change?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>{icon}</span>{label}
        </span>
        {change}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}

/** Kunlik savdo va foyda - oddiy SVG ustunlar */
function TrendChart({ trend }: { trend: Report["trend"] }) {
  const { t } = useTranslation();
  if (trend.length < 2) return null;
  const max = Math.max(...trend.map((day) => Math.max(day.revenue, 0)), 1);
  const width = 1000, height = 180, gap = 2;
  const bar = Math.max(2, width / trend.length - gap);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span className="font-semibold uppercase tracking-wide">{t("exec.trend")}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />{t("exec.net_revenue")}</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" />{t("exec.gross_profit")}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 20}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={t("exec.trend")}>
        {trend.map((day, index) => {
          const x = index * (bar + gap);
          const h = (Math.max(day.revenue, 0) / max) * height;
          const p = (Math.max(day.profit, 0) / max) * height;
          return (
            <g key={day.day}>
              <title>{`${dayjs(day.day).format("DD.MM.YYYY")}: ${fmt(day.revenue)} · ${t("exec.gross_profit").toLowerCase()} ${fmt(day.profit)} · ${day.checks} ${t("exec.checks_short")}`}</title>
              <rect x={x} y={height - h} width={bar} height={h} rx={2} className="fill-brand-500/80" />
              <rect x={x + bar * 0.25} y={height - p} width={bar * 0.5} height={p} rx={1} className="fill-green-500" />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-gray-400">
        <span>{dayjs(trend[0].day).format("DD.MM")}</span>
        <span>{dayjs(trend[trend.length - 1].day).format("DD.MM")}</span>
      </div>
    </div>
  );
}

export default function ExecutiveReport() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { token } = useAuth();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"));
  // Qaysi tez tugma bosilgan - sanalar bir xil chiqsa ham (oyning 1-kuni: "Bugun" = "Shu oy") faqat bittasi belgilanadi
  const [preset, setPreset] = useState<string | null>("month");
  const [drill, setDrill] = useState<Drill>({});
  const [groupBy, setGroupBy] = useState<GroupBy>("branch");
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const params = new URLSearchParams({ from, to, groupBy });
      for (const [key, value] of Object.entries(drill)) if (value) params.set(key, value);
      const res = await fetch(`/api/reports/executive?${params}`, { headers: auth });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
      setReport(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [from, to, groupBy, drill, auth, t]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const go = (next: Drill) => { setDrill(next); setGroupBy(nextLevel(next)); };

  /** Qatorni bosish - ichiga kirish */
  const open = (row: Row) => {
    if (!row.key) return;
    if (groupBy === "branch") go({ ...drill, branchId: row.key });
    else if (groupBy === "warehouse") go({ ...drill, warehouseId: row.key });
    else if (groupBy === "category") go({ ...drill, categoryId: row.key });
    else if (groupBy === "cashier") go({ ...drill, cashierId: row.key });
    else if (groupBy === "day") { setFrom(row.key); setTo(row.key); setPreset(null); setGroupBy(nextLevel(drill)); }
  };
  const canOpen = groupBy !== "material";

  const totals = report?.totals;
  const prev = report?.previousTotals;
  const nameOf = (row: Row) => (groupBy === "day" ? dayjs(row.key).format("DD.MM.YYYY, dd") : typeof row.name === "object" && row.name ? localized(row.name, lang) : row.name || t("exec.unknown"));
  const scopeName = (value: any) => (typeof value === "object" && value ? localized(value, lang) : value);
  const maxRevenue = Math.max(...(report?.rows || []).map((row) => row.netRevenue), 1);
  const showMoney = totals?.expenses !== null && totals?.expenses !== undefined;
  const showBranchMoney = groupBy === "branch";

  // Joriy darajada ko'rish mumkin bo'lgan kesimlar
  const groups = useMemo(() => {
    const list: GroupBy[] = [nextLevel(drill)];
    for (const extra of ["category", "material", "day", "cashier"] as GroupBy[]) if (!list.includes(extra) && !(extra === "category" && drill.categoryId) && !(extra === "cashier" && drill.cashierId)) list.push(extra);
    return list;
  }, [drill]);

  const crumbs = [
    { label: t("exec.company"), drill: {} as Drill },
    ...(report?.scope.branch ? [{ label: report.scope.branch.name, drill: { branchId: drill.branchId } }] : []),
    ...(report?.scope.warehouse ? [{ label: report.scope.warehouse.name, drill: { branchId: drill.branchId, warehouseId: drill.warehouseId } }] : []),
    ...(report?.scope.category ? [{ label: scopeName(report.scope.category.name), drill: { branchId: drill.branchId, warehouseId: drill.warehouseId, categoryId: drill.categoryId } }] : []),
    ...(report?.scope.cashier ? [{ label: report.scope.cashier.name, drill }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Davr */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label={t("exec.path")}>
          {crumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
              <button
                onClick={() => go(crumb.drill)} disabled={index === crumbs.length - 1}
                className={`flex items-center gap-1 rounded-md px-2 py-1 ${index === crumbs.length - 1 ? "font-semibold text-gray-900 dark:text-white" : "text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"}`}
              >
                {index === 0 && <HomeIcon className="h-4 w-4" />}{crumb.label}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900">
            {PRESETS.map((option) => {
              const [a, b] = option.range();
              const active = preset === option.key;
              return (
                <button key={option.key} onClick={() => { setPreset(option.key); setFrom(a.format("YYYY-MM-DD")); setTo(b.format("YYYY-MM-DD")); }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}>
                  {t(`exec.preset_${option.key}`)}
                </button>
              );
            })}
          </div>
          <input type="date" aria-label={t("cash.from")} value={from} max={to} onChange={(e) => { if (e.target.value) { setFrom(e.target.value); setPreset(null); } }} className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <span className="text-gray-400">—</span>
          <input type="date" aria-label={t("cash.to")} value={to} min={from} onChange={(e) => { if (e.target.value) { setTo(e.target.value); setPreset(null); } }} className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <button onClick={load} aria-label={t("stock.refresh")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10">{error}</div>}

      {totals && prev && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<ShoppingBag className="h-4 w-4" />} tone="bg-brand-50 text-brand-600 dark:bg-brand-500/10" label={t("exec.net_revenue")} value={short(totals.netRevenue, t)}
              sub={t("exec.revenue_sub", { revenue: fmt(totals.revenue), returns: fmt(totals.returns) })} change={<Change now={totals.netRevenue} before={prev.netRevenue} />} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} tone="bg-green-50 text-green-600 dark:bg-green-500/10" label={t("exec.gross_profit")} value={short(totals.grossProfit, t)}
              sub={totals.margin !== null ? t("exec.margin_sub", { margin: totals.margin, cost: fmt(totals.cost) }) : t("exec.cost_sub", { cost: fmt(totals.cost) })} change={<Change now={totals.grossProfit} before={prev.grossProfit} />} />
            <Kpi icon={<Receipt className="h-4 w-4" />} tone="bg-gray-100 text-gray-600 dark:bg-gray-800" label={t("exec.checks")} value={qtyFmt.format(totals.checks)}
              sub={t("exec.avg_check_sub", { value: fmt(totals.avgCheck) })} change={<Change now={totals.checks} before={prev.checks} />} />
            <Kpi icon={<Package className="h-4 w-4" />} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10" label={t("exec.sold_qty")} value={qtyFmt.format(totals.qty)}
              sub={t("stock.pcs")} change={<Change now={totals.qty} before={prev.qty} />} />
            {showMoney && (
              <>
                <Kpi icon={<RotateCcw className="h-4 w-4" />} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10" label={t("exec.returns")} value={short(totals.returns, t)}
                  sub={totals.revenue ? t("exec.returns_sub", { value: ((totals.returns / totals.revenue) * 100).toFixed(1) }) : undefined} change={<Change now={totals.returns} before={prev.returns} invert />} />
                <Kpi icon={<Wallet className="h-4 w-4" />} tone="bg-red-50 text-red-600 dark:bg-red-500/10" label={t("exec.expenses")} value={short(totals.expenses || 0, t)} change={<Change now={totals.expenses || 0} before={prev.expenses || 0} invert />} />
                <Kpi icon={<TrendingUp className="h-4 w-4" />} tone={(totals.netProfit || 0) >= 0 ? "bg-green-50 text-green-600 dark:bg-green-500/10" : "bg-red-50 text-red-600 dark:bg-red-500/10"}
                  label={t("exec.net_profit")} value={short(totals.netProfit || 0, t)} sub={t("exec.net_profit_sub")} change={<Change now={totals.netProfit || 0} before={prev.netProfit || 0} />} />
                <Kpi icon={<Banknote className="h-4 w-4" />} tone="bg-teal-50 text-teal-600 dark:bg-teal-500/10" label={t("exec.income")} value={short(totals.income || 0, t)} sub={t("exec.income_sub")} />
              </>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {t("exec.compare", { from: dayjs(report!.period.previous.from).format("DD.MM.YYYY"), to: dayjs(report!.period.previous.to).format("DD.MM.YYYY") })}
          </p>

          <TrendChart trend={report!.trend} />

          {/* Kesim jadvali */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 p-3 dark:border-gray-800" role="tablist">
              {groups.map((group) => (
                <button key={group} role="tab" aria-selected={groupBy === group} onClick={() => setGroupBy(group)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${groupBy === group ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}>
                  {t(`exec.by_${group}`)}
                </button>
              ))}
              {canOpen && <span className="ml-auto text-xs text-gray-400">{t("exec.click_hint")}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-2 text-left">{t(`exec.col_${groupBy}`)}</th>
                    <th className="px-3 py-2 text-right">{t("exec.net_revenue")}</th>
                    <th className="w-32 px-3 py-2 text-left">{t("exec.share")}</th>
                    <th className="px-3 py-2 text-right">{t("exec.checks")}</th>
                    <th className="px-3 py-2 text-right">{t("exec.avg_check")}</th>
                    <th className="px-3 py-2 text-right">{t("exec.sold_qty")}</th>
                    <th className="px-3 py-2 text-right">{t("exec.cost")}</th>
                    <th className="px-3 py-2 text-right">{t("exec.gross_profit")}</th>
                    <th className="px-3 py-2 text-right">{t("exec.margin")}</th>
                    {showBranchMoney && <th className="px-3 py-2 text-right">{t("exec.expenses")}</th>}
                    {showBranchMoney && <th className="px-3 py-2 text-right">{t("exec.net_profit")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {report!.rows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-400">{t("exec.empty")}</td></tr>}
                  {report!.rows.map((row) => (
                    <tr key={row.key || "none"} onClick={() => canOpen && open(row)} className={canOpen ? "cursor-pointer hover:bg-brand-50/40 dark:hover:bg-brand-500/5" : ""}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          {groupBy === "material" && (row.extra?.imageUrl
                            ? <img src={row.extra.imageUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
                            : <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-300 dark:bg-gray-800"><Package className="h-4 w-4" /></span>)}
                          <span className="min-w-0">
                            <span className="block font-medium text-gray-900 dark:text-white">{nameOf(row)}</span>
                            {groupBy === "warehouse" && row.extra && <span className="block text-xs text-gray-400">{row.extra}</span>}
                            {groupBy === "category" && row.extra && <span className="block text-xs text-gray-400">{localized(row.extra, lang)}</span>}
                            {groupBy === "material" && row.extra && <span className="block text-xs text-gray-400">{[row.extra.size, localized(row.extra.color, lang), row.extra.sku].filter(Boolean).join(" · ")}</span>}
                          </span>
                          {canOpen && <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                        {fmt(row.netRevenue)}
                        {row.returns > 0 && <span className="block text-xs font-normal text-amber-600">−{fmt(row.returns)}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800">
                            <span className="block h-1.5 rounded-full bg-brand-500" style={{ width: `${Math.max(0, (row.netRevenue / maxRevenue) * 100)}%` }} />
                          </span>
                          <span className="w-10 text-right text-xs tabular-nums text-gray-500">{totals.netRevenue > 0 ? `${((row.netRevenue / totals.netRevenue) * 100).toFixed(0)}%` : "—"}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{row.checks}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(row.avgCheck)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{qtyFmt.format(row.qty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{fmt(row.cost)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${row.grossProfit < 0 ? "text-red-600" : "text-green-600 dark:text-green-400"}`}>{fmt(row.grossProfit)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{row.margin !== null ? `${row.margin}%` : "—"}</td>
                      {showBranchMoney && <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{fmt(row.expenses)}</td>}
                      {showBranchMoney && <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${(row.netProfit || 0) < 0 ? "text-red-600" : "text-gray-900 dark:text-white"}`}>{fmt(row.netProfit)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400">{t("exec.method_note")}</p>
        </>
      )}
      {!report && isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}
    </div>
  );
}
