import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { HandCoins, Plus, Search, Trash2, X } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../../components/common/Pagination";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";

/**
 * Kassadan olingan pul (inkassatsiya).
 *
 * Kim, qaysi kassirdan, qaysi kassadan, qaysi valyuta va to'lov turida
 * qancha olib ketgani. Pul to'liq olinmasligi mumkin: forma kassada hozir
 * nima borligini ko'rsatadi, olingandan keyin qancha qolishini hisoblaydi.
 */

interface WithdrawalRow {
  id: string;
  withdrawnAt: string;
  cashRegisterId: string;
  cashRegister: { id: string; name: string; branchName: string | null } | null;
  currency: { id: string; code: string } | null;
  paymentType: { id: string; name: string } | null;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  fromUser: { id: string; name: string } | null;
  takenBy: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  description: string | null;
}

interface Options {
  cashRegisters: { id: string; name: string; branchName: string | null; isActive?: boolean; userIds: string[] }[];
  currencies: { id: string; code: string; name: string; isBase: boolean }[];
  paymentTypes: { id: string; name: string }[];
  users: { id: string; name: string }[];
  currentUserId: string | null;
}

interface Balance { currencyId: string; currencyCode: string | null; paymentTypeId: string | null; paymentTypeName: string | null; balance: number }

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const fmt = (value: number) => money.format(value || 0);
const parseNumber = (value: string) => Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";
const td = "px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

const blank = () => ({ cashRegisterId: "", bucket: "", amount: "", fromUserId: "", takenById: "", withdrawnAt: dayjs().format("YYYY-MM-DDTHH:mm"), description: "" });

export default function CashWithdrawals() {
  const { t } = useTranslation();
  const { token, logout } = useAuth();
  const { canCreate, canDelete } = usePermissions();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [registerFilter, setRegisterFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(blank());
  const [balances, setBalances] = useState<Balance[]>([]);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<WithdrawalRow | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const [listRes, optionsRes] = await Promise.all([
        fetch("/api/cash-withdrawals", { headers: auth }),
        fetch("/api/cash-withdrawals/options", { headers: auth }),
      ]);
      if (listRes.status === 401) return logout();
      if (!listRes.ok) throw new Error(errorMessage(await readJson(listRes), t("common.load_error")));
      setRows(await listRes.json());
      if (optionsRes.ok) setOptions(await optionsRes.json());
    } catch (err: any) {
      setLoadError(err.message || t("common.load_error"));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const query = normalizeSearch(search);
  const filtered = useMemo(
    () => rows.filter((row) =>
      (!registerFilter || row.cashRegisterId === registerFilter) &&
      (!query || normalizeSearch([row.cashRegister?.name, row.fromUser?.name, row.takenBy?.name, row.description, row.currency?.code].filter(Boolean).join(" ")).includes(query))),
    [rows, query, registerFilter],
  );
  useEffect(() => { setPage(1); }, [query, registerFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Valyuta bo'yicha jami olingan - valyutalar aralashmaydi
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filtered) map.set(row.currency?.code || "", (map.get(row.currency?.code || "") || 0) + row.amount);
    return [...map.entries()];
  }, [filtered]);

  /* ----------------------------------- Forma ----------------------------------- */

  const register = options?.cashRegisters.find((item) => item.id === form.cashRegisterId);
  const bucket = balances.find((item) => `${item.currencyId}|${item.paymentTypeId || ""}` === form.bucket);
  const amount = parseNumber(form.amount);
  const left = bucket && amount > 0 ? bucket.balance - amount : null;

  const pickRegister = async (cashRegisterId: string) => {
    const picked = options?.cashRegisters.find((item) => item.id === cashRegisterId);
    // Kassada bitta kassir bo'lsa - "kimdan" o'zi qo'yiladi
    setForm((prev) => ({ ...prev, cashRegisterId, bucket: "", amount: "", fromUserId: picked?.userIds.length === 1 ? picked.userIds[0] : "" }));
    setBalances([]);
    setFormError("");
    if (!cashRegisterId) return;
    try {
      const res = await fetch(`/api/cash-registers/${cashRegisterId}/balance`, { headers: auth });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
      const positive = (data as Balance[]).filter((item) => item.balance > 0);
      setBalances(positive);
      if (positive.length === 1) setForm((prev) => ({ ...prev, bucket: `${positive[0].currencyId}|${positive[0].paymentTypeId || ""}` }));
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const openForm = () => {
    setForm({ ...blank(), takenById: options?.currentUserId || "" });
    setBalances([]);
    setFormError("");
    setSaved(null);
    setIsOpen(true);
  };

  const save = async () => {
    const required = (field: string) => setFormError(t("ref.required_field", { field }));
    if (!form.cashRegisterId) return required(t("cash.register"));
    if (!bucket) return required(t("cash.money_kind"));
    if (!(amount > 0)) return required(t("inbounds.amount"));
    if (amount > bucket.balance) return setFormError(t("cash.over_balance", { amount: fmt(bucket.balance), code: bucket.currencyCode }));

    try {
      setIsSaving(true);
      setFormError("");
      const res = await fetch("/api/cash-withdrawals", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          cashRegisterId: form.cashRegisterId,
          currencyId: bucket.currencyId,
          paymentTypeId: bucket.paymentTypeId,
          amount: Math.round(amount * 100) / 100,
          fromUserId: form.fromUserId || null,
          takenById: form.takenById || null,
          withdrawnAt: form.withdrawnAt,
          description: form.description,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.save_error")));
      setSaved(data);
      await load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (row: WithdrawalRow) => {
    if (!window.confirm(t("cash.delete_confirm", { amount: fmt(row.amount), code: row.currency?.code }))) return;
    try {
      const res = await fetch(`/api/cash-withdrawals/${row.id}`, { method: "DELETE", headers: auth });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("users.delete_error")));
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const mayDelete = canDelete("cash-withdrawals");
  const columnCount = 9 + (mayDelete ? 1 : 0);

  return (
    <>
      <PageMeta title={`${t("modules.cashWithdrawals.title")} | Gulbahor`} description={t("modules.cashWithdrawals.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">{t("modules.cashWithdrawals.title")}</h2>
            {totalsByCurrency.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("payments.total_uzs")}: {totalsByCurrency.map(([code, sum], index) => (
                  <span key={code}>{index > 0 && " · "}<b className="text-gray-800 dark:text-white">{fmt(sum)}</b> {code}</span>
                ))}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              aria-label={t("cash.register")} value={registerFilter} onChange={(e) => setRegisterFilter(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">{t("cash.all_registers")}</option>
              {options?.cashRegisters.map((item) => <option key={item.id} value={item.id}>{item.name}{item.branchName ? ` (${item.branchName})` : ""}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-40 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-56"
              />
            </div>
            {canCreate("cash-withdrawals") && (
              <Button onClick={openForm} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("cash.withdraw")}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={th}>{t("cash.time")}</th>
                <th className={th}>{t("cash.register")}</th>
                <th className={th}>{t("cash.from_user")}</th>
                <th className={th}>{t("cash.taken_by")}</th>
                <th className={th}>{t("payments.payment_type")}</th>
                <th className={`${th} text-right`}>{t("cash.was")}</th>
                <th className={`${th} text-right`}>{t("cash.taken")}</th>
                <th className={`${th} text-right`}>{t("cash.left")}</th>
                <th className={th}>{t("inbounds.description")}</th>
                {mayDelete && <th className={th} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
              ) : loadError ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-red-500">{loadError}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-gray-500">{t("ref.empty")}</td></tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10">
                    <td className={`${td} whitespace-nowrap`}>{dayjs(row.withdrawnAt).format("DD.MM.YYYY HH:mm")}</td>
                    <td className={td}>
                      <span className="block font-medium text-gray-900 dark:text-white">{row.cashRegister?.name}</span>
                      {row.cashRegister?.branchName && <span className="block text-xs text-gray-400">{row.cashRegister.branchName}</span>}
                    </td>
                    <td className={td}>{row.fromUser?.name || "—"}</td>
                    <td className={`${td} font-medium text-gray-900 dark:text-white`}>{row.takenBy?.name || "—"}</td>
                    <td className={td}>{row.paymentType?.name || "—"}</td>
                    <td className={`${td} text-right tabular-nums text-gray-500`}>{fmt(row.balanceBefore)}</td>
                    <td className={`${td} text-right tabular-nums font-semibold text-amber-600 dark:text-amber-400`}>
                      {fmt(row.amount)} <span className="text-xs font-normal text-gray-400">{row.currency?.code}</span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(row.balanceAfter)}</td>
                    <td className={`${td} max-w-xs truncate text-gray-500 dark:text-gray-400`} title={row.description || ""}>{row.description || "—"}</td>
                    {mayDelete && (
                      <td className={`${td} text-right`}>
                        <button onClick={() => remove(row)} title={t("common.delete")} aria-label={t("common.delete")} className="text-gray-400 opacity-0 hover:text-red-500 group-hover:opacity-100 focus:opacity-100">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
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

      {isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"><HandCoins className="h-5 w-5 text-amber-500" />{t("cash.withdraw")}</h3>
              <button onClick={() => setIsOpen(false)} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {saved ? (
              <div className="px-6 py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-500/10"><HandCoins className="h-7 w-7" /></div>
                <p className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{t("cash.saved_title", { amount: fmt(saved.amount), code: saved.currency?.code })}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t("cash.saved_left", { amount: fmt(saved.balanceAfter), code: saved.currency?.code, register: saved.cashRegister?.name })}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Button variant="outline" onClick={() => setIsOpen(false)}>{t("common.close")}</Button>
                  <Button onClick={openForm}>{t("cash.withdraw_more")}</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <div className="col-span-2">
                      <label className={labelClass}>{t("cash.register")} <span className="text-red-500">*</span></label>
                      <select name="cashRegisterId" value={form.cashRegisterId} onChange={(e) => pickRegister(e.target.value)} className={inputClass}>
                        <option value="">{t("ref.choose")}</option>
                        {options?.cashRegisters.filter((item) => item.isActive !== false).map((item) => (
                          <option key={item.id} value={item.id}>{item.name}{item.branchName ? ` (${item.branchName})` : ""}</option>
                        ))}
                      </select>
                    </div>

                    {/* Kassada hozir nima bor - tanlab olinadi */}
                    {register && (
                      <div className="col-span-2">
                        <span className={labelClass}>{t("cash.money_kind")} <span className="text-red-500">*</span></span>
                        {balances.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700">{t("cash.register_empty")}</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {balances.map((item) => {
                              const key = `${item.currencyId}|${item.paymentTypeId || ""}`;
                              const active = form.bucket === key;
                              return (
                                <button
                                  key={key} type="button" onClick={() => setForm((prev) => ({ ...prev, bucket: key, amount: "" }))}
                                  className={`rounded-lg border px-3 py-2 text-left ${active ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-gray-200 hover:border-gray-300 dark:border-gray-700"}`}
                                >
                                  <span className="block text-xs text-gray-500 dark:text-gray-400">{item.paymentTypeName || t("cash.no_payment_type")}</span>
                                  <span className="block text-base font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(item.balance)} <span className="text-xs font-normal text-gray-500">{item.currencyCode}</span></span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>{t("cash.amount_to_take")}{bucket ? ` (${bucket.currencyCode})` : ""} <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                        <input
                          name="amount" type="text" inputMode="decimal" placeholder="0" value={form.amount} disabled={!bucket}
                          onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value.replace(/[^\d.,\s]/g, "") }))}
                          className={inputClass}
                        />
                        {bucket && (
                          <button type="button" onClick={() => setForm((prev) => ({ ...prev, amount: String(bucket.balance) }))} className="shrink-0 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
                            {t("cash.all")}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <span className={labelClass}>{t("cash.will_remain")}</span>
                      <div className={`flex h-10 items-center rounded-lg bg-gray-50 px-3 text-sm font-semibold tabular-nums dark:bg-gray-800 ${left !== null && left < 0 ? "text-red-600" : "text-gray-900 dark:text-white"}`}>
                        {left === null ? "—" : `${fmt(left)} ${bucket?.currencyCode || ""}`}
                      </div>
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>{t("cash.from_user")}</label>
                      <select name="fromUserId" value={form.fromUserId} onChange={(e) => setForm((prev) => ({ ...prev, fromUserId: e.target.value }))} className={inputClass}>
                        <option value="">{t("ref.not_selected")}</option>
                        {register && register.userIds.length > 0 && (
                          <optgroup label={t("cash.cashiers")}>
                            {options?.users.filter((user) => register.userIds.includes(user.id)).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                          </optgroup>
                        )}
                        <optgroup label={t("cash.all_users")}>
                          {options?.users.filter((user) => !register?.userIds.includes(user.id)).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </optgroup>
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>{t("cash.taken_by")}</label>
                      <select name="takenById" value={form.takenById} onChange={(e) => setForm((prev) => ({ ...prev, takenById: e.target.value }))} className={inputClass}>
                        {options?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>{t("cash.time")}</label>
                      <input name="withdrawnAt" type="datetime-local" value={form.withdrawnAt} onChange={(e) => setForm((prev) => ({ ...prev, withdrawnAt: e.target.value }))} className={inputClass} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelClass}>{t("inbounds.description")}</label>
                      <textarea
                        name="description" rows={2} maxLength={2000} value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        className={`${inputClass} h-auto py-2`}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
                  {formError && <p role="alert" className="mb-3 text-sm font-medium text-red-500">{formError}</p>}
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>{t("common.cancel")}</Button>
                    <Button onClick={save} disabled={isSaving || !bucket}>{isSaving ? t("common.saving") : t("cash.withdraw")}</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
