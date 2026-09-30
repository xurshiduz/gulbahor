import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Plus, Search, X } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../../components/common/Pagination";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { STATUS_STYLE, fmtQty, type Inventory } from "./shared";

interface Options {
  branches: { id: string; name: string; isActive?: boolean }[];
  warehouses: { id: string; name: string; branchId: string; isActive?: boolean }[];
  users: { id: string; name: string }[];
}

const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";
const td = "px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300";
const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

/** Inventarizatsiyalar ro'yxati va yangisini yaratish */
export default function InventoryList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  const { canCreate } = usePermissions();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [rows, setRows] = useState<Inventory[]>([]);
  const [options, setOptions] = useState<Options>({ branches: [], warehouses: [], users: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ branchId: "", warehouseId: "", startDate: "", endDate: "", responsibleId: "", description: "" });
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const [listRes, optionsRes] = await Promise.all([fetch("/api/inventory", { headers: auth }), fetch("/api/inventory/options", { headers: auth })]);
      if (listRes.status === 401) return logout();
      if (!listRes.ok) throw new Error(errorMessage(await readJson(listRes), t("common.load_error")));
      setRows(await listRes.json());
      if (optionsRes.ok) setOptions(await optionsRes.json());
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const query = normalizeSearch(search);
  const filtered = useMemo(() => rows.filter((row) =>
    (!statusFilter || row.status === statusFilter) &&
    (!query || normalizeSearch([row.number, row.branch?.name, row.warehouse?.name, row.responsible?.name, row.description].filter(Boolean).join(" ")).includes(query))), [rows, query, statusFilter]);
  useEffect(() => { setPage(1); }, [query, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openForm = () => {
    const todayStr = dayjs().format("YYYY-MM-DD");
    const branchId = options.branches.length === 1 ? options.branches[0].id : "";
    const stores = options.warehouses.filter((w) => w.branchId === branchId);
    setForm({ branchId, warehouseId: stores.length === 1 ? stores[0].id : "", startDate: todayStr, endDate: todayStr, responsibleId: user?.id || "", description: "" });
    setFormError("");
    setIsOpen(true);
  };

  const save = async () => {
    const required = (field: string) => setFormError(t("ref.required_field", { field }));
    if (!form.branchId) return required(t("stock.branch"));
    if (!form.warehouseId) return required(t("stock.warehouse"));
    if (!form.startDate) return required(t("inventory.start_date"));
    if (!form.endDate) return required(t("inventory.end_date"));
    try {
      setIsSaving(true);
      setFormError("");
      const res = await fetch("/api/inventory", {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, responsibleId: form.responsibleId || null }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.save_error")));
      navigate(`/inventory/${data.id}`);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const branchWarehouses = options.warehouses.filter((w) => w.branchId === form.branchId && w.isActive !== false);

  return (
    <>
      <PageMeta title={`${t("modules.inventory.title")} | Gulbahor`} description={t("modules.inventory.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">{t("modules.inventory.title")}</h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <option value="">{t("inbounds.all_statuses")}</option>
              {(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{t(`inventory.status_${s}`)}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-40 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-56" />
            </div>
            {canCreate("inventory") && (
              <Button onClick={openForm} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" /> {t("inventory.new")}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={th}>{t("inbounds.number")}</th>
                <th className={th}>{t("stock.warehouse")}</th>
                <th className={th}>{t("inventory.period")}</th>
                <th className={th}>{t("inventory.responsible")}</th>
                <th className={`${th} text-right`}>{t("inventory.counted")}</th>
                <th className={`${th} text-right`}>{t("inventory.shortage")}</th>
                <th className={`${th} text-right`}>{t("inventory.surplus")}</th>
                <th className={th}>{t("ref.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
              ) : loadError ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-red-500">{loadError}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">{t("ref.empty")}</td></tr>
              ) : pageRows.map((row) => (
                <tr key={row.id} onClick={() => navigate(`/inventory/${row.id}`)} className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10">
                  <td className={`${td} whitespace-nowrap font-mono text-xs font-semibold text-gray-900 dark:text-white`}>{row.number}</td>
                  <td className={td}>
                    <span className="block font-medium text-gray-900 dark:text-white">{row.warehouse?.name}</span>
                    <span className="block text-xs text-gray-400">{row.branch?.name}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{dayjs(row.startDate).format("DD.MM.YYYY")} — {dayjs(row.endDate).format("DD.MM.YYYY")}</td>
                  <td className={td}>{row.responsible?.name || "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtQty(row.progress.counted)}{row.totals ? <span className="text-gray-400"> / {fmtQty(row.totals.expected)}</span> : null}</td>
                  <td className={`${td} text-right tabular-nums ${row.totals?.shortageQty ? "font-semibold text-red-600 dark:text-red-400" : ""}`}>{row.totals ? fmtQty(row.totals.shortageQty) : "—"}</td>
                  <td className={`${td} text-right tabular-nums ${row.totals?.surplusQty ? "font-semibold text-blue-600 dark:text-blue-400" : ""}`}>{row.totals ? fmtQty(row.totals.surplusQty) : "—"}</td>
                  <td className={`${td} whitespace-nowrap`}><span className={`rounded-md px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[row.status]}`}>{t(`inventory.status_${row.status}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={currentPage} pageSize={pageSize} total={filtered.length} overall={rows.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("inventory.new")}</h3>
              <button onClick={() => setIsOpen(false)} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 overflow-y-auto px-6 py-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>{t("stock.branch")} <span className="text-red-500">*</span></label>
                <select name="branchId" value={form.branchId} onChange={(e) => { const stores = options.warehouses.filter((w) => w.branchId === e.target.value); setForm({ ...form, branchId: e.target.value, warehouseId: stores.length === 1 ? stores[0].id : "" }); }} className={inputClass}>
                  <option value="">{t("ref.choose")}</option>
                  {options.branches.filter((b) => b.isActive !== false).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>{t("stock.warehouse")} <span className="text-red-500">*</span></label>
                <select name="warehouseId" value={form.warehouseId} disabled={!form.branchId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className={inputClass}>
                  <option value="">{t("ref.choose")}</option>
                  {branchWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>{t("inventory.start_date")} <span className="text-red-500">*</span></label>
                <input name="startDate" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} className={inputClass} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>{t("inventory.end_date")} <span className="text-red-500">*</span></label>
                <input name="endDate" type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>{t("inventory.responsible")}</label>
                <select name="responsibleId" value={form.responsibleId} onChange={(e) => setForm({ ...form, responsibleId: e.target.value })} className={inputClass}>
                  <option value="">{t("ref.not_selected")}</option>
                  {options.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>{t("inbounds.description")}</label>
                <textarea name="description" rows={2} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputClass} h-auto py-2`} />
              </div>
            </div>
            <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              {formError && <p role="alert" className="mb-3 text-sm font-medium text-red-500">{formError}</p>}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={save} disabled={isSaving}>{isSaving ? t("common.saving") : t("inventory.create")}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
