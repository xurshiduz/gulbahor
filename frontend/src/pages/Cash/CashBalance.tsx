import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { ArrowDownLeft, ArrowUpRight, HandCoins, RefreshCw, Wallet } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { errorMessage, readJson } from "../../utils/api";

/**
 * Kassadagi qoldiq.
 *
 * Qoldiq kassa x valyuta x to'lov turi bo'yicha, har biri o'z valyutasida.
 * Sana oralig'i berilsa: boshidagi qoldiq, oraliqdagi tushum, harajat va
 * kassadan olingan pul, oxiridagi qoldiq. Oraliqsiz - hozirgi holat.
 */

interface BalanceRow {
  cashRegisterId: string; cashRegisterName: string | null; branchId: string | null; branchName: string | null;
  currencyId: string; currencyCode: string | null; isBase: boolean;
  paymentTypeId: string | null; paymentTypeName: string | null;
  opening: number; income: number; expense: number; withdrawn: number; closing: number;
}
interface Total {
  currencyId: string; currencyCode: string | null; isBase: boolean;
  opening: number; income: number; expense: number; withdrawn: number; closing: number;
}
interface Named { id: string; name: string }
interface RegisterRef extends Named { branchId: string; branchName: string | null }

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const fmt = (value: number) => money.format(value || 0);

const selectClass =
  "h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const th = "px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 whitespace-nowrap";
const td = "px-3 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap";

/** Tez tanlanadigan oraliqlar */
const PRESETS = [
  { key: "today", range: () => [dayjs(), dayjs()] },
  { key: "yesterday", range: () => [dayjs().subtract(1, "day"), dayjs().subtract(1, "day")] },
  { key: "week", range: () => [dayjs().subtract(6, "day"), dayjs()] },
  { key: "month", range: () => [dayjs().startOf("month"), dayjs()] },
] as const;

export default function CashBalance() {
  const { t } = useTranslation();
  const { token, logout } = useAuth();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [branches, setBranches] = useState<Named[]>([]);
  const [registers, setRegisters] = useState<RegisterRef[]>([]);
  const [branchId, setBranchId] = useState("");
  const [cashRegisterId, setCashRegisterId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [totals, setTotals] = useState<Total[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Filtr uchun kassalar; filiallar kassalardan olinadi (kassasiz filialda qoldiq ham yo'q)
  useEffect(() => {
    if (!token) return;
    fetch("/api/cash-registers/mine?all=1", { headers: auth })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list: RegisterRef[] = (data || []).map((row: any) => ({ id: row.id, name: row.name, branchId: row.branchId, branchName: row.branch?.name || null }));
        setRegisters(list);
        const unique = new Map(list.map((row) => [row.branchId, { id: row.branchId, name: row.branchName || "—" }]));
        setBranches([...unique.values()].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, [token, auth]);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError("");
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (cashRegisterId) params.set("cashRegisterId", cashRegisterId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/cash-balance?${params}`, { headers: auth });
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
  }, [branchId, cashRegisterId, from, to, auth]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const hasPeriod = !!(from || to);
  const branchRegisters = registers.filter((register) => !branchId || register.branchId === branchId);

  // Kassa bo'yicha guruhlash: filial -> kassa -> valyuta / to'lov turi qatorlari
  const groups = useMemo(() => {
    const map = new Map<string, { name: string | null; branchName: string | null; rows: BalanceRow[] }>();
    for (const row of rows) {
      const group = map.get(row.cashRegisterId) || { name: row.cashRegisterName, branchName: row.branchName, rows: [] };
      group.rows.push(row);
      map.set(row.cashRegisterId, group);
    }
    return [...map.entries()];
  }, [rows]);

  const periodLabel = hasPeriod
    ? `${from ? dayjs(from).format("DD.MM.YYYY") : "…"} — ${to ? dayjs(to).format("DD.MM.YYYY") : t("cash.today")}`
    : t("cash.now");

  const colorOf = (value: number) => (value < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white");

  return (
    <>
      <PageMeta title={`${t("modules.cashBalance.title")} | Gulbahor`} description={t("modules.cashBalance.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-950 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-6 shrink-0">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-white/90">{t("modules.cashBalance.title")}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={t("stock.branch")} value={branchId} onChange={(e) => { setBranchId(e.target.value); setCashRegisterId(""); }} className={selectClass}>
              <option value="">{t("stock.all_branches")}</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select aria-label={t("cash.register")} value={cashRegisterId} onChange={(e) => setCashRegisterId(e.target.value)} className={selectClass}>
              <option value="">{t("cash.all_registers")}</option>
              {branchRegisters.map((register) => <option key={register.id} value={register.id}>{register.name}{!branchId && register.branchName ? ` (${register.branchName})` : ""}</option>)}
            </select>
            <input type="date" aria-label={t("cash.from")} value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
            <span className="text-gray-400">—</span>
            <input type="date" aria-label={t("cash.to")} value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} />
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
              {PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => { const [a, b] = preset.range(); setFrom(a.format("YYYY-MM-DD")); setTo(b.format("YYYY-MM-DD")); }}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  {t(`cash.preset_${preset.key}`)}
                </button>
              ))}
              <button
                onClick={() => { setFrom(""); setTo(""); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${!hasPeriod ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}
              >
                {t("cash.now")}
              </button>
            </div>
            <button onClick={load} title={t("stock.refresh")} aria-label={t("stock.refresh")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="space-y-4 p-4 md:p-6">
            {/* Valyuta bo'yicha jami - har xil valyuta qo'shilmaydi */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {totals.length === 0 && !isLoading && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 md:col-span-2 xl:col-span-3">
                  {loadError || t("cash.empty")}
                </div>
              )}
              {totals.map((total) => (
                <div key={total.currencyId} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"><Wallet className="h-4 w-4" /></span>
                      {hasPeriod ? t("cash.closing") : t("cash.in_register")}
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{total.currencyCode}</span>
                  </div>
                  <div className={`mt-3 text-2xl font-bold tabular-nums ${colorOf(total.closing)}`}>{fmt(total.closing)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {hasPeriod && (
                      <span className="col-span-2 text-gray-500 dark:text-gray-400">{t("cash.opening")}: <b className="text-gray-700 dark:text-gray-200">{fmt(total.opening)}</b></span>
                    )}
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><ArrowDownLeft className="h-3.5 w-3.5" />{t("cash.income")}: {fmt(total.income)}</span>
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><ArrowUpRight className="h-3.5 w-3.5" />{t("cash.expense")}: {fmt(total.expense)}</span>
                    <span className="col-span-2 flex items-center gap-1 text-amber-600 dark:text-amber-400"><HandCoins className="h-3.5 w-3.5" />{t("cash.withdrawn")}: {fmt(total.withdrawn)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Kassalar kesimida */}
            {groups.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <th className={`${th} text-left`}>{t("inbounds.currency")}</th>
                        <th className={`${th} text-left`}>{t("payments.payment_type")}</th>
                        {hasPeriod && <th className={th}>{t("cash.opening")}</th>}
                        <th className={th}>{t("cash.income")}</th>
                        <th className={th}>{t("cash.expense")}</th>
                        <th className={th}>{t("cash.withdrawn")}</th>
                        <th className={th}>{hasPeriod ? t("cash.closing") : t("cash.in_register")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(([registerId, group]) => (
                        <Fragment key={registerId}>
                          <tr className="border-t border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/30">
                            <td colSpan={hasPeriod ? 7 : 6} className="px-3 py-2 text-sm">
                              <span className="font-semibold text-gray-900 dark:text-white">{group.name}</span>
                              {group.branchName && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{group.branchName}</span>}
                            </td>
                          </tr>
                          {group.rows.map((row) => (
                            <tr key={`${row.currencyId}-${row.paymentTypeId}`} className="border-t border-gray-100 dark:border-gray-800">
                              <td className={`${td} text-left font-mono text-xs font-semibold`}>{row.currencyCode}</td>
                              <td className={`${td} text-left`}>{row.paymentTypeName || <span className="text-gray-400">{t("cash.no_payment_type")}</span>}</td>
                              {hasPeriod && <td className={td}>{fmt(row.opening)}</td>}
                              <td className={`${td} text-green-600 dark:text-green-400`}>{row.income ? `+${fmt(row.income)}` : "—"}</td>
                              <td className={`${td} text-red-600 dark:text-red-400`}>{row.expense ? `−${fmt(row.expense)}` : "—"}</td>
                              <td className={`${td} text-amber-600 dark:text-amber-400`}>{row.withdrawn ? `−${fmt(row.withdrawn)}` : "—"}</td>
                              <td className={`${td} font-semibold ${colorOf(row.closing)}`}>{fmt(row.closing)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
