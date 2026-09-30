import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, KeyRound, Loader2, PlugZap, RefreshCw, Save, Send, XCircle,
} from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";

/**
 * Integratsiyalar: to'lov tizimlari (Payme, Click Pass, UDS, terminallar)
 * va marketpleyslarga qoldiq (Uzum Market, Wildberries, Ozon).
 *
 * Hamma kalitlar shu sahifadan kiritiladi va bazada saqlanadi (maxfiylari
 * shifrlangan, qayta ko'rsatilmaydi - faqat oxirgi 4 belgisi).
 */

interface Field { key: string; secret: boolean; required: boolean; placeholder: string | null }
interface Integration {
  code: string; kind: "PAYMENT" | "MARKETPLACE"; title: string; api: string; docsUrl: string | null; hasTestMode: boolean;
  fields: Field[]; isEnabled: boolean; isTest: boolean;
  credentials: Record<string, { value?: string; set: boolean; hint?: string | null; broken?: boolean }>;
  options: Record<string, any>;
  lastSyncAt: string | null; lastStatus: string | null; lastMessage: string | null; configured: boolean;
}
interface Named { id: string; name: string; isActive?: boolean; branch?: { name: string } | null }
interface LogRow { id: string; action: string; status: string; message: string; createdAt: string; details?: any }
interface TxRow {
  id: string; provider: string; status: string; amount: number; externalId: string | null; reference: string | null;
  outboundDocumentId: string | null; error: string | null; createdAt: string; createdBy: { name: string } | null;
}

const BRAND: Record<string, string> = {
  PAYME: "bg-[#33CCCC] text-white", CLICK: "bg-[#0073FF] text-white", UDS: "bg-[#6B4EFF] text-white", ARCA: "bg-gray-800 text-white",
  UZUM_PAY: "bg-[#7000FF] text-white", UZUM_MARKET: "bg-[#7000FF] text-white", WILDBERRIES: "bg-[#CB11AB] text-white", OZON: "bg-[#005BFF] text-white",
};
const SYNC_INTERVALS = [0, 15, 30, 60, 180, 360, 1440];

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const labelClass = "mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400";
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function StatusChip({ status }: { status: string | null }) {
  const { t } = useTranslation();
  if (!status) return null;
  const tone = status === "OK" ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
    : status === "PARTIAL" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{t(`integrations.status_${status}`)}</span>;
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

/** Bitta integratsiya kartochkasi: kalitlar, sozlamalar, tekshirish, (marketpleysda) qoldiq yuborish */
function ProviderCard({ item, paymentTypes, warehouses, auth, canUpdate, canSync, onSaved }: {
  item: Integration; paymentTypes: Named[]; warehouses: Named[]; auth: Record<string, string>;
  canUpdate: boolean; canSync: boolean; onSaved: (next: Integration) => void;
}) {
  const { t } = useTranslation();
  const isMarket = item.kind === "MARKETPLACE";
  const initial = () => ({
    isEnabled: item.isEnabled,
    isTest: item.isTest,
    values: Object.fromEntries(item.fields.map((field) => [field.key, field.secret ? "" : item.credentials[field.key]?.value || ""])),
    paymentTypeId: item.options.paymentTypeId || "",
    warehouseIds: (item.options.warehouseIds || []) as string[],
    targetWarehouseId: item.options.targetWarehouseId || "",
    matchBy: item.options.matchBy || "sku",
    safetyStock: String(item.options.safetyStock ?? 0),
    autoSyncMinutes: Number(item.options.autoSyncMinutes ?? 0),
  });
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState<"" | "save" | "test" | "sync" | "warehouses">("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [remote, setRemote] = useState<{ id: string; name: string }[] | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [rejected, setRejected] = useState<{ key: string; name: string; reason: string }[]>([]);

  useEffect(() => { setForm(initial()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [item]);

  const call = async (url: string, method = "GET", body?: unknown) => {
    const res = await fetch(url, { method, headers: { ...auth, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await readJson(res);
    if (!res.ok) throw new Error(errorMessage(data, t("common.error")));
    return data;
  };

  const save = async (patch: Partial<ReturnType<typeof initial>> = {}) => {
    const next = { ...form, ...patch };
    try {
      setBusy("save");
      setNotice(null);
      const credentials = Object.fromEntries(item.fields.map((field) => [field.key, next.values[field.key] ?? ""]));
      const data: Integration = await call(`/api/integrations/${item.code}`, "PUT", {
        isEnabled: next.isEnabled,
        ...(item.hasTestMode ? { isTest: next.isTest } : {}),
        credentials,
        ...(isMarket
          ? { marketplace: { warehouseIds: next.warehouseIds, targetWarehouseId: next.targetWarehouseId, matchBy: next.matchBy, safetyStock: Math.max(0, Math.floor(Number(next.safetyStock) || 0)), autoSyncMinutes: next.autoSyncMinutes } }
          : { paymentTypeId: next.paymentTypeId || null }),
      });
      onSaved(data);
      setNotice({ ok: true, text: t("integrations.saved") });
    } catch (err: any) {
      setNotice({ ok: false, text: err.message });
      // Yoqish rad etilsa - tugma holati qaytadi
      if (patch.isEnabled !== undefined) setForm((prev) => ({ ...prev, isEnabled: item.isEnabled }));
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    try {
      setBusy("test");
      setNotice(null);
      const data = await call(`/api/integrations/${item.code}/test`, "POST");
      setNotice({ ok: data.ok, text: data.message });
      if (logs) loadLogs();
    } catch (err: any) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setBusy("");
    }
  };

  const sync = async () => {
    try {
      setBusy("sync");
      setNotice(null);
      setRejected([]);
      const data = await call(`/api/integrations/${item.code}/sync`, "POST");
      setNotice({ ok: data.status !== "ERROR", text: data.message });
      setRejected(data.rejected || []);
    } catch (err: any) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setBusy("");
      if (logs) loadLogs();
      // Oxirgi yuborish vaqti va holati yangilansin
      call("/api/integrations").then((list: Integration[]) => { const fresh = list.find((row) => row.code === item.code); if (fresh) onSaved(fresh); }).catch(() => {});
    }
  };

  const loadRemote = async () => {
    try {
      setBusy("warehouses");
      setNotice(null);
      setRemote(await call(`/api/integrations/${item.code}/warehouses`));
    } catch (err: any) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setBusy("");
    }
  };

  const loadLogs = useCallback(async () => {
    try { setLogs(await call(`/api/integrations/${item.code}/logs`)); } catch { setLogs([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.code]);

  const setValue = (key: string, value: string) => setForm((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));
  const toggleWarehouse = (id: string) => setForm((prev) => ({
    ...prev, warehouseIds: prev.warehouseIds.includes(id) ? prev.warehouseIds.filter((x) => x !== id) : [...prev.warehouseIds, id],
  }));

  return (
    <div className={`flex flex-col rounded-xl border bg-white dark:bg-gray-900 ${item.isEnabled ? "border-brand-300 dark:border-brand-500/40" : "border-gray-200 dark:border-gray-800"}`}>
      {/* Sarlavha */}
      <div className="flex items-start gap-3 border-b border-gray-100 p-4 dark:border-gray-800">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${BRAND[item.code] || "bg-gray-200 text-gray-700"}`}>
          {item.title.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{item.title}</h3>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${item.isEnabled ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>
              {item.isEnabled ? t("integrations.enabled") : t("integrations.disabled")}
            </span>
            {item.isTest && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{t("integrations.test_mode")}</span>}
            <StatusChip status={item.lastStatus} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t(`integrations.desc_${item.code}`)}</p>
          {item.lastMessage && (
            <p className="mt-1 truncate text-xs text-gray-400" title={item.lastMessage}>
              {item.lastSyncAt ? `${dayjs(item.lastSyncAt).format("DD.MM HH:mm")} · ` : ""}{item.lastMessage}
            </p>
          )}
        </div>
        {item.docsUrl && (
          <a href={item.docsUrl} target="_blank" rel="noreferrer" title={t("integrations.docs")} aria-label={t("integrations.docs")} className="text-gray-400 hover:text-brand-500">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="flex-1 space-y-4 p-4">
        {item.api === "manual" && (
          <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t("integrations.manual_note")}
          </p>
        )}

        {/* Kalitlar */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {item.fields.map((field) => {
            const state = item.credentials[field.key];
            return (
              <div key={field.key}>
                <label className={labelClass}>
                  {field.secret && <KeyRound className="mr-1 inline h-3 w-3" />}
                  {t(`integrations.field_${field.key}`)}{field.required && <span className="text-red-500"> *</span>}
                </label>
                <input
                  type={field.secret ? "password" : "text"} autoComplete="off" disabled={!canUpdate}
                  value={form.values[field.key] || ""} onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder={field.secret ? (state?.set ? t("integrations.secret_saved", { hint: state.hint || "••••" }) : t("integrations.secret_enter")) : field.placeholder || ""}
                  className={`${inputClass} ${field.secret ? "font-mono" : ""}`}
                />
                {state?.broken && <p className="mt-1 text-xs text-red-500">{t("integrations.secret_broken")}</p>}
              </div>
            );
          })}
        </div>

        {item.hasTestMode && <Toggle checked={form.isTest} onChange={(value) => setForm((prev) => ({ ...prev, isTest: value }))} label={t("integrations.test_mode_label")} disabled={!canUpdate} />}

        {/* To'lov: qaysi to'lov turiga yoziladi */}
        {!isMarket && (
          <div>
            <label className={labelClass}>{t("integrations.payment_type")} <span className="text-red-500">*</span></label>
            <select value={form.paymentTypeId} disabled={!canUpdate} onChange={(e) => setForm((prev) => ({ ...prev, paymentTypeId: e.target.value }))} className={inputClass}>
              <option value="">{t("ref.choose")}</option>
              {paymentTypes.filter((type) => type.isActive !== false || type.id === form.paymentTypeId).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("integrations.payment_type_hint")}</p>
          </div>
        )}

        {/* Marketpleys: omborlar va yuborish sozlamalari */}
        {isMarket && (
          <>
            <div>
              <span className={labelClass}>{t("integrations.our_warehouses")} <span className="text-red-500">*</span></span>
              <div className="flex flex-wrap gap-1.5">
                {warehouses.length === 0 && <span className="text-xs text-gray-400">{t("integrations.no_warehouses")}</span>}
                {warehouses.map((warehouse) => {
                  const on = form.warehouseIds.includes(warehouse.id);
                  return (
                    <button
                      key={warehouse.id} type="button" disabled={!canUpdate} onClick={() => toggleWarehouse(warehouse.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${on ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"}`}
                    >
                      {warehouse.name}{warehouse.branch ? ` · ${warehouse.branch.name}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>{item.api === "uzum-market" ? t("integrations.target_shop") : t("integrations.target_warehouse")}{item.api !== "uzum-market" && <span className="text-red-500"> *</span>}</label>
                <div className="flex gap-2">
                  {remote ? (
                    <select value={form.targetWarehouseId} disabled={!canUpdate} onChange={(e) => setForm((prev) => ({ ...prev, targetWarehouseId: e.target.value }))} className={inputClass}>
                      <option value="">{t("ref.choose")}</option>
                      {remote.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.id})</option>)}
                    </select>
                  ) : (
                    <input type="text" value={form.targetWarehouseId} disabled={!canUpdate} placeholder="ID" onChange={(e) => setForm((prev) => ({ ...prev, targetWarehouseId: e.target.value }))} className={`${inputClass} font-mono`} />
                  )}
                  <button
                    type="button" onClick={loadRemote} disabled={!item.configured || !!busy} title={t("integrations.load_remote")}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
                  >
                    {busy === "warehouses" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("integrations.load_remote")}
                  </button>
                </div>
                {!item.configured && <p className="mt-1 text-xs text-gray-400">{t("integrations.save_keys_first")}</p>}
              </div>
              {item.api === "ozon" && (
                <div>
                  <label className={labelClass}>{t("integrations.match_by")}</label>
                  <select value={form.matchBy} disabled={!canUpdate} onChange={(e) => setForm((prev) => ({ ...prev, matchBy: e.target.value }))} className={inputClass}>
                    <option value="sku">{t("integrations.match_sku")}</option>
                    <option value="barcode">{t("integrations.match_barcode")}</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelClass}>{t("integrations.safety_stock")}</label>
                <input type="number" min={0} value={form.safetyStock} disabled={!canUpdate} onChange={(e) => setForm((prev) => ({ ...prev, safetyStock: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("integrations.auto_sync")}</label>
                <select value={form.autoSyncMinutes} disabled={!canUpdate} onChange={(e) => setForm((prev) => ({ ...prev, autoSyncMinutes: Number(e.target.value) }))} className={inputClass}>
                  {SYNC_INTERVALS.map((minutes) => <option key={minutes} value={minutes}>{minutes ? t("integrations.every_minutes", { count: minutes }) : t("integrations.manual_only")}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t(item.api === "ozon" ? "integrations.match_hint_ozon" : "integrations.match_hint_barcode")}</p>
          </>
        )}

        {notice && (
          <p role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
            {notice.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="break-words">{notice.text}</span>
          </p>
        )}
        {rejected.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 dark:border-amber-500/30">
            <table className="min-w-full text-xs">
              <tbody className="divide-y divide-amber-100 dark:divide-amber-500/20">
                {rejected.map((row) => (
                  <tr key={row.key}><td className="px-2 py-1 font-mono">{row.key}</td><td className="px-2 py-1">{row.name}</td><td className="px-2 py-1 text-amber-700 dark:text-amber-300">{row.reason}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Amallar */}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
        <Toggle
          checked={form.isEnabled} disabled={!canUpdate || !!busy} label={t("integrations.enable")}
          onChange={(value) => { setForm((prev) => ({ ...prev, isEnabled: value })); save({ isEnabled: value }); }}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => (logs ? setLogs(null) : loadLogs())}
            className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            {logs ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{t("integrations.logs")}
          </button>
          <button onClick={test} disabled={!item.configured || !!busy} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}{t("integrations.test")}
          </button>
          {isMarket && canSync && (
            <button onClick={sync} disabled={!item.isEnabled || !!busy} className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300">
              {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t("integrations.sync_now")}
            </button>
          )}
          {canUpdate && (
            <button onClick={() => save()} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t("common.save")}
            </button>
          )}
        </div>
      </div>

      {logs && (
        <div className="max-h-56 overflow-y-auto border-t border-gray-100 dark:border-gray-800">
          {logs.length === 0 ? <p className="p-4 text-center text-xs text-gray-400">{t("integrations.logs_empty")}</p> : (
            <ul className="divide-y divide-gray-100 text-xs dark:divide-gray-800">
              {logs.map((log) => (
                <li key={log.id} className="flex items-start gap-2 px-4 py-2">
                  <span className="w-24 shrink-0 tabular-nums text-gray-400">{dayjs(log.createdAt).format("DD.MM HH:mm:ss")}</span>
                  <span className="w-12 shrink-0 font-medium text-gray-500">{log.action}</span>
                  <StatusChip status={log.status} />
                  <span className="min-w-0 flex-1 break-words text-gray-700 dark:text-gray-300">{log.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function IntegrationsPage({ kind }: { kind: "PAYMENT" | "MARKETPLACE" }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { can } = usePermissions();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [items, setItems] = useState<Integration[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<Named[]>([]);
  const [warehouses, setWarehouses] = useState<Named[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const moduleKey = kind === "PAYMENT" ? "paymentIntegrations" : "marketplaceIntegrations";

  const loadTransactions = useCallback(async () => {
    const res = await fetch("/api/integrations/transactions", { headers: auth });
    if (res.ok) setTransactions(await res.json());
  }, [auth]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch("/api/integrations", { headers: auth });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
        setItems(data);
        const [types, stores] = await Promise.all([
          fetch("/api/payment-types", { headers: auth }).then((r) => (r.ok ? r.json() : [])),
          fetch("/api/warehouses", { headers: auth }).then((r) => (r.ok ? r.json() : [])),
        ]);
        setPaymentTypes(types);
        setWarehouses(stores);
        if (kind === "PAYMENT") await loadTransactions();
      } catch (err: any) {
        setLoadError(err.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [token, auth, kind, t, loadTransactions]);

  const cancelTx = async (tx: TxRow) => {
    if (!window.confirm(t("integrations.tx_cancel_confirm", { amount: money.format(tx.amount) }))) return;
    const res = await fetch(`/api/integrations/pay/${tx.id}/cancel`, { method: "POST", headers: auth });
    if (!res.ok) alert(errorMessage(await readJson(res), t("common.error")));
    loadTransactions();
  };

  const shown = items.filter((item) => item.kind === kind);
  const txTone: Record<string, string> = {
    PAID: "text-green-600 dark:text-green-400", PENDING: "text-amber-600 dark:text-amber-400", FAILED: "text-red-600 dark:text-red-400", CANCELLED: "text-gray-400",
  };

  return (
    <>
      <PageMeta title={`${t(`modules.${moduleKey}.title`)} | Gulbahor`} description={t(`modules.${moduleKey}.desc`)} />
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-950 w-full">
        <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-6 shrink-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-white/90">{t(`modules.${moduleKey}.title`)}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t(`integrations.intro_${kind}`)}</p>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
          {isLoading ? <p className="text-center text-sm text-gray-500">{t("common.loading")}</p> : loadError ? <p className="text-center text-sm text-red-500">{loadError}</p> : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {shown.map((item) => (
                  <ProviderCard
                    key={item.code} item={item} paymentTypes={paymentTypes} warehouses={warehouses} auth={auth}
                    canUpdate={can("update:integrations")} canSync={can("sync:integrations")}
                    onSaved={(next) => setItems((prev) => prev.map((row) => (row.code === next.code ? next : row)))}
                  />
                ))}
              </div>

              {kind === "PAYMENT" && (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("integrations.transactions")}</h3>
                    <button onClick={loadTransactions} aria-label={t("stock.refresh")} className="text-gray-400 hover:text-gray-700"><RefreshCw className="h-4 w-4" /></button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-4 py-2 text-left">{t("cash.time")}</th>
                          <th className="px-4 py-2 text-left">{t("integrations.provider")}</th>
                          <th className="px-4 py-2 text-right">{t("inbounds.amount")}</th>
                          <th className="px-4 py-2 text-left">{t("integrations.reference")}</th>
                          <th className="px-4 py-2 text-left">{t("ref.status")}</th>
                          <th className="px-4 py-2 text-left">{t("pos.cashier")}</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {transactions.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">{t("ref.empty")}</td></tr>
                        ) : transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-500">{dayjs(tx.createdAt).format("DD.MM.YYYY HH:mm")}</td>
                            <td className="px-4 py-2 font-medium">{items.find((row) => row.code === tx.provider)?.title || tx.provider}</td>
                            <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{money.format(tx.amount)}</td>
                            <td className="px-4 py-2 font-mono text-xs">{tx.externalId || tx.reference || "—"}</td>
                            <td className={`px-4 py-2 text-xs font-semibold ${txTone[tx.status] || ""}`}>
                              {t(`integrations.tx_${tx.status}`)}
                              {tx.status === "PAID" && !tx.outboundDocumentId && <span className="ml-1 font-normal text-amber-600">· {t("integrations.tx_unattached")}</span>}
                              {tx.error && <span className="block font-normal text-red-500">{tx.error}</span>}
                            </td>
                            <td className="px-4 py-2 text-gray-500">{tx.createdBy?.name || "—"}</td>
                            <td className="px-4 py-2 text-right">
                              {(tx.status === "PENDING" || (tx.status === "PAID" && !tx.outboundDocumentId)) && can("update:integrations") && (
                                <button onClick={() => cancelTx(tx)} className="text-xs font-medium text-red-500 hover:underline">{t("integrations.tx_cancel")}</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function PaymentIntegrations() {
  return <IntegrationsPage kind="PAYMENT" />;
}

export function MarketplaceIntegrations() {
  return <IntegrationsPage kind="MARKETPLACE" />;
}
