import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  AlertTriangle, ArrowLeft, Ban, CheckCircle2, ClipboardCheck, Copy, Download, PackageCheck, PackageMinus, PackagePlus, Play, Printer, RotateCcw, ScanLine, Target, Trash2,
} from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { localized, type LocalizedName } from "../../utils/localized";
import { STATUS_STYLE, fmtMoney, fmtQty, type Inventory, type Totals } from "./shared";

interface ReportItem {
  materialId: string;
  material: { id: string; name: string; sku: string | null; barcode: string | null; size: string | null; color: LocalizedName | null; brand: string | null; unit: LocalizedName | null } | null;
  expected: number; counted: number; difference: number; costPrice: number; salePrice: number; differenceCost: number; differenceSale: number;
}
interface Report { inventory: Inventory; completed: boolean; totals: Totals | null; items: ReportItem[]; unknownTags: { epc: string; createdAt: string }[] }
interface ScanRow { id: string; epc: string | null; code: string | null; quantity: number; createdAt: string; material: { name: string; sku: string | null; size: string | null } | null; scannedBy: { name: string } | null }

type Filter = "all" | "shortage" | "surplus" | "match";

function Card({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}

/**
 * Inventarizatsiya tafsiloti: boshqarish (boshlash, tugatish, qayta ochish),
 * sanash jarayoni (jonli) va tugatilgach - hisobot.
 */
export default function InventoryDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { can } = usePermissions();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [inv, setInv] = useState<Inventory | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);

  const api = useCallback(async (url: string, method = "GET") => {
    const res = await fetch(url, { method, headers: auth });
    const data = await readJson(res);
    if (!res.ok) throw new Error(errorMessage(data, t("common.error")));
    return data;
  }, [auth, t]);

  const load = useCallback(async () => {
    try {
      const data: Inventory = await api(`/api/inventory/${id}`);
      setInv(data);
      if (data.status === "COMPLETED") setReport(await api(`/api/inventory/${id}/report`));
      else setReport(null);
      if (data.status === "IN_PROGRESS") setScans(await api(`/api/inventory/${id}/scans?limit=30`));
    } catch (err: any) {
      setError(err.message);
    }
  }, [api, id]);

  useEffect(() => { if (token) load(); }, [token, load]);

  // Sanash davomida - har 5 soniyada yangilanadi (skaner boshqa qurilmada)
  useEffect(() => {
    if (inv?.status !== "IN_PROGRESS") return;
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [inv?.status, load]);

  const action = async (path: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      setBusy(true);
      setError("");
      await api(`/api/inventory/${id}/${path}`, "POST");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("ref.delete_confirm", { name: inv?.number }))) return;
    try {
      await api(`/api/inventory/${id}`, "DELETE");
      navigate("/inventory");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const scanUrl = `${window.location.origin}/inventory/${id}/scan`;
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(scanUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* ruxsat yo'q */ }
  };

  /** Hisobot - CSV (Excel ochadi): nuqta-vergul bilan, UTF-8 BOM */
  const downloadCsv = () => {
    if (!report || !inv) return;
    const head = [t("inbounds.product"), t("materials.sku"), t("materials.barcode"), t("materials.size"), t("inventory.expected"), t("inventory.counted"), t("inventory.difference"), t("inventory.cost_price"), t("inventory.diff_cost"), t("stock.sale_price"), t("inventory.diff_sale")];
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = report.items.map((item) => [
      item.material?.name, item.material?.sku, item.material?.barcode, item.material?.size,
      item.expected, item.counted, item.difference, item.costPrice, item.differenceCost, item.salePrice, item.differenceSale,
    ].map(cell).join(";"));
    const blob = new Blob(["﻿" + [head.map(cell).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${inv.number}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!inv) return <div className="flex flex-1 items-center justify-center text-sm text-gray-500">{error || t("common.loading")}</div>;

  const totals = report?.totals;
  const shown = (report?.items || []).filter((item) =>
    filter === "all" || (filter === "shortage" ? item.difference < 0 : filter === "surplus" ? item.difference > 0 : item.difference === 0));
  const counts = {
    all: report?.items.length || 0,
    shortage: report?.items.filter((i) => i.difference < 0).length || 0,
    surplus: report?.items.filter((i) => i.difference > 0).length || 0,
    match: report?.items.filter((i) => i.difference === 0).length || 0,
  };
  const outOfPeriod = inv.status === "PLANNED" && dayjs().format("YYYY-MM-DD") < inv.startDate;
  const btn = "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50";

  return (
    <>
      <PageMeta title={`${inv.number} | ${t("modules.inventory.title")}`} description={t("modules.inventory.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-950 w-full print:bg-white">
        {/* Sarlavha */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-6 shrink-0 print:border-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link to="/inventory" aria-label={t("inbounds.back")} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-gray-700 print:hidden"><ArrowLeft className="h-4 w-4" /></Link>
            <h2 className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{inv.number}</h2>
            <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[inv.status]}`}>{t(`inventory.status_${inv.status}`)}</span>
            <span className="text-sm text-gray-600 dark:text-gray-300">{inv.warehouse?.name} · {inv.branch?.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {inv.status === "PLANNED" && can("update:inventory") && (
              <button onClick={() => action("start")} disabled={busy} className={`${btn} bg-brand-500 text-white hover:bg-brand-600`}><Play className="h-4 w-4" />{t("inventory.start")}</button>
            )}
            {inv.status === "IN_PROGRESS" && (
              <>
                <a href={`/inventory/${id}/scan`} target="_blank" rel="noreferrer" className={`${btn} border border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300`}>
                  <ScanLine className="h-4 w-4" />{t("inventory.open_scanner")}
                </a>
                {can("update:inventory") && (
                  <button onClick={() => action("finish", t("inventory.finish_confirm"))} disabled={busy} className={`${btn} bg-green-600 text-white hover:bg-green-700`}><ClipboardCheck className="h-4 w-4" />{t("inventory.finish")}</button>
                )}
              </>
            )}
            {inv.status === "COMPLETED" && (
              <>
                <button onClick={downloadCsv} className={`${btn} border border-gray-300 hover:bg-gray-50 dark:border-gray-700`}><Download className="h-4 w-4" />CSV</button>
                <button onClick={() => window.print()} className={`${btn} border border-gray-300 hover:bg-gray-50 dark:border-gray-700`}><Printer className="h-4 w-4" />{t("pos.print").split(" ")[0]}</button>
                {can("update:inventory") && (
                  <button onClick={() => action("reopen", t("inventory.reopen_confirm"))} disabled={busy} className={`${btn} border border-gray-300 hover:bg-gray-50 dark:border-gray-700`}><RotateCcw className="h-4 w-4" />{t("inventory.reopen")}</button>
                )}
              </>
            )}
            {(inv.status === "PLANNED" || inv.status === "IN_PROGRESS") && can("update:inventory") && (
              <button onClick={() => action("cancel", t("inventory.cancel_confirm"))} disabled={busy} className={`${btn} text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10`}><Ban className="h-4 w-4" />{t("inventory.cancel")}</button>
            )}
            {(inv.status === "PLANNED" || inv.status === "CANCELLED") && can("delete:inventory") && (
              <button onClick={remove} className={`${btn} text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10`}><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
          <div className="space-y-4">
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10">{error}</div>}

            {/* Asosiy ma'lumotlar */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-4">
              <div><span className="block text-xs text-gray-500">{t("inventory.period")}</span>{dayjs(inv.startDate).format("DD.MM.YYYY")} — {dayjs(inv.endDate).format("DD.MM.YYYY")}</div>
              <div><span className="block text-xs text-gray-500">{t("inventory.responsible")}</span>{inv.responsible?.name || "—"}</div>
              <div><span className="block text-xs text-gray-500">{t("inventory.started")}</span>{inv.startedAt ? dayjs(inv.startedAt).format("DD.MM.YYYY HH:mm") : "—"}</div>
              <div><span className="block text-xs text-gray-500">{t("inventory.finished")}</span>{inv.finishedAt ? `${dayjs(inv.finishedAt).format("DD.MM.YYYY HH:mm")}${inv.finishedBy ? ` · ${inv.finishedBy.name}` : ""}` : "—"}</div>
              {inv.description && <div className="col-span-2 md:col-span-4"><span className="block text-xs text-gray-500">{t("inbounds.description")}</span>{inv.description}</div>}
            </div>

            {inv.status === "PLANNED" && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {outOfPeriod ? t("inventory.planned_future", { date: dayjs(inv.startDate).format("DD.MM.YYYY") }) : t("inventory.planned_hint")}
              </div>
            )}

            {/* Sanash jarayoni */}
            {inv.status === "IN_PROGRESS" && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Card icon={<PackageCheck className="h-4 w-4" />} label={t("inventory.counted")} value={fmtQty(inv.progress.counted)} sub={t("stock.pcs")} tone="bg-brand-50 text-brand-600 dark:bg-brand-500/10" />
                  <Card icon={<Target className="h-4 w-4" />} label={t("stock.card_sku")} value={fmtQty(inv.progress.skuCount)} sub={t("inventory.sku_hint")} tone="bg-gray-100 text-gray-600 dark:bg-gray-800" />
                  <Card icon={<AlertTriangle className="h-4 w-4" />} label={t("inventory.unknown")} value={fmtQty(inv.progress.unknown)} sub={t("inventory.unknown_hint")} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10" />
                </div>
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-sm dark:border-brand-500/30 dark:bg-brand-500/5">
                  <p className="font-medium text-gray-800 dark:text-gray-100">{t("inventory.scanner_hint")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-white px-3 py-1.5 font-mono text-xs dark:bg-gray-900">{scanUrl}</code>
                    <button onClick={copyUrl} className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-xs dark:border-gray-700 dark:bg-gray-900"><Copy className="h-3.5 w-3.5" />{copied ? t("inventory.copied") : t("common.copy")}</button>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold dark:border-gray-800">
                    {t("inventory.recent_scans")}
                    {inv.progress.lastScanAt && <span className="ml-2 text-xs font-normal text-gray-400">{dayjs(inv.progress.lastScanAt).format("HH:mm:ss")}</span>}
                  </div>
                  <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    {scans.length === 0 && <li className="p-6 text-center text-gray-400">{t("inventory.no_scans")}</li>}
                    {scans.map((scan) => (
                      <li key={scan.id} className="flex items-center gap-3 px-4 py-2">
                        <span className="w-16 tabular-nums text-xs text-gray-400">{dayjs(scan.createdAt).format("HH:mm:ss")}</span>
                        <span className="min-w-0 flex-1 truncate">{scan.material ? `${scan.material.name}${scan.material.size ? ` · ${scan.material.size}` : ""}` : <span className="text-amber-600">{t("inventory.unknown_tag")}</span>}</span>
                        <span className="font-mono text-xs text-gray-400">{scan.epc || scan.code}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* Hisobot */}
            {report && totals && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Card icon={<Target className="h-4 w-4" />} label={t("inventory.expected")} value={fmtQty(totals.expected)} sub={t("inventory.positions", { count: totals.positions })} tone="bg-gray-100 text-gray-600 dark:bg-gray-800" />
                  <Card icon={<PackageCheck className="h-4 w-4" />} label={t("inventory.counted")} value={fmtQty(totals.counted)} sub={t("stock.pcs")} tone="bg-brand-50 text-brand-600 dark:bg-brand-500/10" />
                  <Card icon={<PackageMinus className="h-4 w-4" />} label={t("inventory.shortage")} value={fmtQty(totals.shortageQty)} sub={`${fmtMoney(totals.shortageCost)} ${t("currencies.sum")} · ${t("inventory.at_cost")}`} tone="bg-red-50 text-red-600 dark:bg-red-500/10" />
                  <Card icon={<PackagePlus className="h-4 w-4" />} label={t("inventory.surplus")} value={fmtQty(totals.surplusQty)} sub={`${fmtMoney(totals.surplusCost)} ${t("currencies.sum")} · ${t("inventory.at_cost")}`} tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10" />
                  <Card icon={<CheckCircle2 className="h-4 w-4" />} label={t("inventory.accuracy")} value={`${totals.accuracy}%`} sub={t("inventory.matched", { count: totals.matched })} tone="bg-green-50 text-green-600 dark:bg-green-500/10" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("inventory.sale_value", { shortage: fmtMoney(totals.shortageSale), surplus: fmtMoney(totals.surplusSale) })}
                  {" · "}{t("inventory.net", { value: fmtMoney(totals.netCost) })}
                </p>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex flex-wrap gap-1 border-b border-gray-100 p-3 dark:border-gray-800 print:hidden" role="tablist">
                    {(["all", "shortage", "surplus", "match"] as Filter[]).map((key) => (
                      <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`rounded-md px-3 py-1 text-xs font-medium ${filter === key ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}>
                        {t(`inventory.filter_${key}`)} ({counts[key]})
                      </button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-4 py-2 text-left">{t("inbounds.product")}</th>
                          <th className="px-3 py-2 text-right">{t("inventory.expected")}</th>
                          <th className="px-3 py-2 text-right">{t("inventory.counted")}</th>
                          <th className="px-3 py-2 text-right">{t("inventory.difference")}</th>
                          <th className="px-3 py-2 text-right">{t("inventory.cost_price")}</th>
                          <th className="px-3 py-2 text-right">{t("inventory.diff_cost")}</th>
                          <th className="px-3 py-2 text-right">{t("inventory.diff_sale")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">{t("common.nothing_found")}</td></tr>}
                        {shown.map((item) => {
                          const tone = item.difference < 0 ? "text-red-600 dark:text-red-400" : item.difference > 0 ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400";
                          const details = [item.material?.size, localized(item.material?.color, lang), item.material?.sku, item.material?.barcode].filter(Boolean).join(" · ");
                          return (
                            <tr key={item.materialId}>
                              <td className="px-4 py-2">
                                <span className="block font-medium text-gray-900 dark:text-white">{item.material?.name || "—"}</span>
                                <span className="block text-xs text-gray-500">{details || "—"}</span>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmtQty(item.expected)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmtQty(item.counted)}</td>
                              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${tone}`}>{item.difference > 0 ? "+" : ""}{fmtQty(item.difference)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtMoney(item.costPrice)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums ${tone}`}>{item.difference ? fmtMoney(item.differenceCost) : "—"}</td>
                              <td className={`px-3 py-2 text-right tabular-nums ${tone}`}>{item.difference ? fmtMoney(item.differenceSale) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {report.unknownTags.length > 0 && (
                  <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/5">
                    <summary className="cursor-pointer font-medium text-amber-800 dark:text-amber-300">{t("inventory.unknown_tags", { count: report.unknownTags.length })}</summary>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{t("inventory.unknown_tags_hint")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {report.unknownTags.map((tag) => <code key={tag.epc} className="rounded bg-white px-2 py-0.5 font-mono text-xs dark:bg-gray-900">{tag.epc}</code>)}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
