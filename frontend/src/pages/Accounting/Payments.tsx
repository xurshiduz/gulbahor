import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Edit, Plus, Search, Trash2, X } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../../components/common/Pagination";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { formatRate } from "./formatRate";

/**
 * To'lovlar (harajatlar).
 *
 * Harajat turi to'lov nimaga yozilishini belgilaydi: kirim hujjatiga
 * (hujjat tanlanadi), yetkazib beruvchiga yoki mijozga (kontragent
 * tanlanadi), yoki hech nimaga (umumiy harajat).
 *
 * Summa valyutada kiritiladi. So'mdan boshqa valyutada kurs to'lov
 * sanasidagi amaldagi kursdan o'zi to'ldiriladi (o'zgartirsa bo'ladi) va
 * so'mdagi summa ham hisoblanib, to'lov bilan birga saqlanadi.
 */

type Target = "NONE" | "INBOUND_DOCUMENT" | "SUPPLIER" | "CUSTOMER";

interface Named { id: string; name: string; isActive?: boolean }
interface ExpenseTypeRef extends Named { target: Target }
interface CurrencyRef { id: string; code: string; name: string; isBase: boolean; isActive?: boolean }
interface ContractorRef extends Named { phone?: string | null; currencyId?: string | null }
interface InboundRef {
  id: string; documentNumber: string; documentDate: string; contractorName: string | null;
  currencyId: string | null; currencyCode: string | null; totalAmount: number;
}
interface Options {
  expenseTypes: ExpenseTypeRef[]; paymentTypes: Named[]; currencies: CurrencyRef[];
  suppliers: ContractorRef[]; customers: ContractorRef[]; inboundDocuments: InboundRef[];
}

interface PaymentRow {
  id: string;
  paymentDate: string;
  expenseTypeId: string;
  expenseType: { id: string; name: string } | null;
  target: Target;
  inboundDocumentId: string | null;
  inboundDocument: { id: string; documentNumber: string } | null;
  contractorId: string | null;
  contractor: { id: string; name: string } | null;
  paymentTypeId: string | null;
  paymentType: { id: string; name: string } | null;
  currencyId: string;
  currency: { id: string; code: string; isBase: boolean } | null;
  amount: number;
  rate: number;
  amountUzs: number;
  description: string | null;
  createdBy: { name: string } | null;
}

const EMPTY_OPTIONS: Options = { expenseTypes: [], paymentTypes: [], currencies: [], suppliers: [], customers: [], inboundDocuments: [] };

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const formatMoney = (value: number) => money.format(value || 0);
/** "12 650,5" yoki "12650.5" -> 12650.5; noto'g'ri bo'lsa NaN */
const parseNumber = (value: string) => Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
const decimalOnly = (value: string) => value.replace(/[^\d.,\s]/g, "");
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";
const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";
const td = "px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

const blankForm = (currencyId = "") => ({
  paymentDate: dayjs().format("YYYY-MM-DD"), expenseTypeId: "", inboundDocumentId: "", contractorId: "", paymentTypeId: "",
  currencyId, amount: "", rate: "", amountUzs: "", description: "",
});
type Form = ReturnType<typeof blankForm>;

export default function Payments() {
  const { t } = useTranslation();
  const { token, logout } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const mayCreate = canCreate("payments");
  const mayUpdate = canUpdate("payments");
  const mayDelete = canDelete("payments");
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [form, setForm] = useState<Form>(blankForm());
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // Kurs qaysi sanadagi kursdan olingani - maydon tagida ko'rsatiladi
  const [rateNote, setRateNote] = useState("");

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const [listRes, optionsRes] = await Promise.all([
        fetch("/api/payments", { headers: auth }),
        fetch("/api/payments/options", { headers: auth }),
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

  /* ---------------------------------- Ro'yxat ---------------------------------- */

  const targetText = (row: PaymentRow) =>
    row.target === "INBOUND_DOCUMENT"
      ? [row.inboundDocument?.documentNumber, row.contractor?.name].filter(Boolean).join(" · ")
      : row.contractor?.name || "";

  const query = normalizeSearch(search);
  const filtered = useMemo(
    () => rows.filter((row) =>
      (!typeFilter || row.expenseTypeId === typeFilter) &&
      (!query || normalizeSearch([row.expenseType?.name, targetText(row), row.paymentType?.name, row.description, row.currency?.code].filter(Boolean).join(" ")).includes(query)),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, typeFilter],
  );
  const totalUzs = useMemo(() => filtered.reduce((sum, row) => sum + row.amountUzs, 0), [filtered]);

  useEffect(() => { setPage(1); }, [query, typeFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /* ----------------------------------- Forma ----------------------------------- */

  const baseCurrency = options.currencies.find((currency) => currency.isBase);
  const expenseType = options.expenseTypes.find((type) => type.id === form.expenseTypeId);
  const target: Target = expenseType?.target || "NONE";
  const currency = options.currencies.find((item) => item.id === form.currencyId);
  const isForeign = !!currency && !currency.isBase;

  const patch = (next: Partial<Form>) => {
    setForm((prev) => ({ ...prev, ...next }));
    if (formError) setFormError("");
  };

  /** So'mdagi summa = summa x kurs (ikkalasi ham kiritilgan bo'lsa) */
  const uzsOf = (amount: string, rate: string) => {
    const value = parseNumber(amount) * parseNumber(rate);
    return Number.isFinite(value) && value > 0 ? String(round2(value)) : "";
  };

  // Oxirgi kurs so'rovi - eskirgan javob keyingisini bosib ketmasin
  const rateRequest = useRef(0);

  /** Valyuta va sana bo'yicha amaldagi kursni yozib qo'yadi; foydalanuvchi keyin o'zgartirishi mumkin */
  const fillRate = async (currencyId: string, date: string, amount: string) => {
    const picked = options.currencies.find((item) => item.id === currencyId);
    const request = ++rateRequest.current;
    if (!picked || picked.isBase) {
      setRateNote("");
      return patch({ rate: "", amountUzs: "" });
    }
    try {
      const res = await fetch(`/api/payments/rate?currencyId=${currencyId}&date=${encodeURIComponent(date)}`, { headers: auth });
      const data = await readJson(res);
      if (request !== rateRequest.current) return;
      if (res.ok && data?.rate) {
        const rate = String(data.rate);
        patch({ rate, amountUzs: uzsOf(amount, rate) });
        setRateNote(t("payments.rate_from", { date: dayjs(data.date).format("DD.MM.YYYY") }));
      } else {
        patch({ rate: "", amountUzs: "" });
        setRateNote(t("payments.rate_missing", { code: picked.code }));
      }
    } catch {
      if (request === rateRequest.current) setRateNote("");
    }
  };

  const openForm = (row?: PaymentRow) => {
    rateRequest.current += 1;
    setEditing(row || null);
    setRateNote("");
    setFormError("");
    setForm(row ? {
      paymentDate: row.paymentDate,
      expenseTypeId: row.expenseTypeId,
      inboundDocumentId: row.inboundDocumentId || "",
      contractorId: row.contractorId || "",
      paymentTypeId: row.paymentTypeId || "",
      currencyId: row.currencyId,
      amount: String(row.amount),
      rate: row.currency?.isBase ? "" : String(row.rate),
      amountUzs: row.currency?.isBase ? "" : String(row.amountUzs),
      description: row.description || "",
    } : blankForm(baseCurrency?.id || ""));
    setIsOpen(true);
  };

  const pickExpenseType = (expenseTypeId: string) => {
    // Bog'lanish turi o'zgaradi - oldingi tanlov (hujjat, kontragent) tozalanadi
    patch({ expenseTypeId, inboundDocumentId: "", contractorId: "" });
  };

  const pickCurrency = (currencyId: string) => {
    patch({ currencyId });
    fillRate(currencyId, form.paymentDate, form.amount);
  };

  const pickDate = (paymentDate: string) => {
    patch({ paymentDate });
    // Kurs sanaga bog'liq - sana o'zgarsa qayta to'ldiriladi
    if (isForeign && paymentDate) fillRate(form.currencyId, paymentDate, form.amount);
  };

  /** Kirim hujjati tanlansa uning valyutasi qo'yiladi */
  const pickInbound = (inboundDocumentId: string) => {
    const document = options.inboundDocuments.find((item) => item.id === inboundDocumentId);
    const currencyId = document ? document.currencyId || baseCurrency?.id || form.currencyId : form.currencyId;
    patch({ inboundDocumentId, currencyId });
    if (currencyId !== form.currencyId) fillRate(currencyId, form.paymentDate, form.amount);
  };

  /** Yetkazib beruvchining hisob-kitob valyutasi bo'lsa - o'sha qo'yiladi */
  const pickContractor = (contractorId: string) => {
    const contractor = [...options.suppliers, ...options.customers].find((item) => item.id === contractorId);
    const currencyId = contractor?.currencyId || form.currencyId;
    patch({ contractorId, currencyId });
    if (currencyId !== form.currencyId) fillRate(currencyId, form.paymentDate, form.amount);
  };

  const save = async () => {
    const required = (field: string) => setFormError(t("ref.required_field", { field }));
    if (!form.expenseTypeId) return required(t("payments.expense_type"));
    if (target === "INBOUND_DOCUMENT" && !form.inboundDocumentId) return required(t("payments.inbound_document"));
    if (target === "SUPPLIER" && !form.contractorId) return required(t("inbounds.supplier"));
    if (target === "CUSTOMER" && !form.contractorId) return required(t("inbounds.customer"));
    if (!form.currencyId) return required(t("inbounds.currency"));
    const amount = parseNumber(form.amount);
    if (!(amount > 0)) return required(t("inbounds.amount"));

    const payload: Record<string, unknown> = {
      paymentDate: form.paymentDate,
      expenseTypeId: form.expenseTypeId,
      inboundDocumentId: target === "INBOUND_DOCUMENT" ? form.inboundDocumentId : null,
      contractorId: target === "SUPPLIER" || target === "CUSTOMER" ? form.contractorId : null,
      paymentTypeId: form.paymentTypeId || null,
      currencyId: form.currencyId,
      amount: round2(amount),
      description: form.description,
    };
    if (isForeign) {
      const rate = parseNumber(form.rate);
      if (!(rate > 0)) return required(t("payments.rate"));
      const amountUzs = parseNumber(form.amountUzs);
      if (!(amountUzs > 0)) return required(t("payments.amount_uzs"));
      payload.rate = Math.round(rate * 10000) / 10000;
      payload.amountUzs = round2(amountUzs);
    }

    try {
      setIsSaving(true);
      setFormError("");
      const res = await fetch(editing ? `/api/payments/${editing.id}` : "/api/payments", {
        method: editing ? "PUT" : "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.save_error")));
      setIsOpen(false);
      await load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (row: PaymentRow) => {
    const name = `${row.expenseType?.name || ""} ${formatMoney(row.amount)} ${row.currency?.code || ""}`.trim();
    if (!window.confirm(t("ref.delete_confirm", { name }))) return;
    try {
      const res = await fetch(`/api/payments/${row.id}`, { method: "DELETE", headers: auth });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("users.delete_error")));
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  /** Faol yozuvlar + tahrirlanayotgan to'lovda tanlangani (faol bo'lmasa ham) */
  const usable = <T extends { id: string; isActive?: boolean }>(list: T[], selected: string) =>
    list.filter((item) => item.isActive !== false || item.id === selected);

  const hasActions = mayUpdate || mayDelete;
  const columnCount = 9 + (hasActions ? 1 : 0);
  const contractors = target === "SUPPLIER" ? options.suppliers : options.customers;

  return (
    <>
      <PageMeta title={`${t("modules.payments.title")} | Gulbahor`} description={t("modules.payments.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">{t("modules.payments.title")}</h2>
            {filtered.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("payments.total_uzs")}: <b className="text-gray-800 dark:text-white">{formatMoney(totalUzs)}</b> {t("currencies.sum")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">{t("payments.all_expense_types")}</option>
              {options.expenseTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-40 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-56"
              />
            </div>
            {mayCreate && (
              <Button onClick={() => openForm()} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.add")}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={th}>{t("inbounds.date")}</th>
                <th className={th}>{t("payments.expense_type")}</th>
                <th className={th}>{t("payments.target")}</th>
                <th className={th}>{t("payments.payment_type")}</th>
                <th className={`${th} text-right`}>{t("inbounds.amount")}</th>
                <th className={`${th} text-right`}>{t("payments.rate")}</th>
                <th className={`${th} text-right`}>{t("payments.amount_uzs")}</th>
                <th className={th}>{t("inbounds.description")}</th>
                <th className={th}>{t("inbounds.created_by")}</th>
                {hasActions && <th className={`${th} text-right`}>{t("users.actions")}</th>}
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
                  <tr key={row.id} className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                    <td className={`${td} whitespace-nowrap`}>{dayjs(row.paymentDate).format("DD.MM.YYYY")}</td>
                    <td className={`${td} font-medium text-gray-900 dark:text-white`}>{row.expenseType?.name || "—"}</td>
                    <td className={td}>
                      {row.target === "NONE" ? <span className="text-gray-400">—</span> : (
                        <>
                          <span className="block text-xs text-gray-400">{t(`expenses.target_${row.target}`)}</span>
                          {row.inboundDocument && <span className="mr-2 font-mono text-xs font-semibold text-gray-900 dark:text-white">{row.inboundDocument.documentNumber}</span>}
                          {row.contractor?.name}
                        </>
                      )}
                    </td>
                    <td className={td}>{row.paymentType?.name || "—"}</td>
                    <td className={`${td} text-right whitespace-nowrap font-medium text-gray-900 dark:text-white`}>
                      {formatMoney(row.amount)} <span className="text-xs font-normal text-gray-400">{row.currency?.code}</span>
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>{row.currency?.isBase ? "—" : formatRate(row.rate)}</td>
                    <td className={`${td} text-right whitespace-nowrap font-medium text-gray-900 dark:text-white`}>{formatMoney(row.amountUzs)}</td>
                    <td className={`${td} max-w-xs truncate text-gray-500 dark:text-gray-400`} title={row.description || ""}>{row.description || "—"}</td>
                    <td className={`${td} whitespace-nowrap text-gray-500 dark:text-gray-400`}>{row.createdBy?.name || "—"}</td>
                    {hasActions && (
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <span className="inline-flex items-center gap-3.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                          {mayUpdate && (
                            <button onClick={() => openForm(row)} title={t("common.edit")} aria-label={t("common.edit")} className="text-gray-400 hover:text-brand-500">
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          {mayDelete && (
                            <button onClick={() => remove(row)} title={t("common.delete")} aria-label={t("common.delete")} className="text-gray-400 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </span>
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
          <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? t("payments.edit") : t("payments.add")}</h3>
              <button onClick={() => setIsOpen(false)} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelClass}>{t("payments.expense_type")} <span className="text-red-500">*</span></label>
                  <select name="expenseTypeId" value={form.expenseTypeId} onChange={(e) => pickExpenseType(e.target.value)} className={inputClass}>
                    <option value="">{t("ref.choose")}</option>
                    {usable(options.expenseTypes, form.expenseTypeId).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select>
                  {expenseType && target !== "NONE" && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(`expenses.target_${target}`)}</p>}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelClass}>{t("inbounds.date")}</label>
                  <input name="paymentDate" type="date" value={form.paymentDate} onChange={(e) => pickDate(e.target.value)} className={inputClass} />
                </div>

                {/* Harajat turi nimaga bog'langan bo'lsa - o'sha tanlanadi */}
                {target === "INBOUND_DOCUMENT" && (
                  <div className="col-span-2">
                    <label className={labelClass}>{t("payments.inbound_document")} <span className="text-red-500">*</span></label>
                    <select name="inboundDocumentId" value={form.inboundDocumentId} onChange={(e) => pickInbound(e.target.value)} className={inputClass}>
                      <option value="">{t("ref.choose")}</option>
                      {options.inboundDocuments.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.documentNumber} · {dayjs(doc.documentDate).format("DD.MM.YYYY")} · {doc.contractorName || "—"} · {formatMoney(doc.totalAmount)} {doc.currencyCode || t("currencies.sum")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {(target === "SUPPLIER" || target === "CUSTOMER") && (
                  <div className="col-span-2">
                    <label className={labelClass}>{target === "SUPPLIER" ? t("inbounds.supplier") : t("inbounds.customer")} <span className="text-red-500">*</span></label>
                    <select name="contractorId" value={form.contractorId} onChange={(e) => pickContractor(e.target.value)} className={inputClass}>
                      <option value="">{t("ref.choose")}</option>
                      {usable(contractors, form.contractorId).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}{item.phone ? ` · ${item.phone}` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="col-span-2 sm:col-span-1">
                  <label className={labelClass}>{t("inbounds.currency")} <span className="text-red-500">*</span></label>
                  <select name="currencyId" value={form.currencyId} onChange={(e) => pickCurrency(e.target.value)} className={inputClass}>
                    <option value="">{t("ref.choose")}</option>
                    {usable(options.currencies, form.currencyId).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelClass}>{t("inbounds.amount")}{currency ? ` (${currency.code})` : ""} <span className="text-red-500">*</span></label>
                  <input
                    name="amount" type="text" inputMode="decimal" placeholder="0" value={form.amount}
                    onChange={(e) => {
                      const amount = decimalOnly(e.target.value);
                      patch(isForeign ? { amount, amountUzs: uzsOf(amount, form.rate) } : { amount });
                    }}
                    className={inputClass}
                  />
                </div>

                {/* So'mdan boshqa valyutada: kurs va so'mdagi summa */}
                {isForeign && (
                  <>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>{t("payments.rate")} <span className="text-red-500">*</span></label>
                      <input
                        name="rate" type="text" inputMode="decimal" placeholder="12650" value={form.rate}
                        onChange={(e) => {
                          const rate = decimalOnly(e.target.value);
                          patch({ rate, amountUzs: uzsOf(form.amount, rate) });
                          setRateNote("");
                        }}
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{rateNote || t("payments.rate_hint", { code: currency?.code })}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>{t("payments.amount_uzs")} <span className="text-red-500">*</span></label>
                      <input
                        name="amountUzs" type="text" inputMode="decimal" placeholder="0" value={form.amountUzs}
                        onChange={(e) => patch({ amountUzs: decimalOnly(e.target.value) })}
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("payments.amount_uzs_hint")}</p>
                    </div>
                  </>
                )}

                <div className="col-span-2 sm:col-span-1">
                  <label className={labelClass}>{t("payments.payment_type")}</label>
                  <select name="paymentTypeId" value={form.paymentTypeId} onChange={(e) => patch({ paymentTypeId: e.target.value })} className={inputClass}>
                    <option value="">{t("ref.not_selected")}</option>
                    {usable(options.paymentTypes, form.paymentTypeId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>{t("inbounds.description")}</label>
                  <textarea
                    name="description" rows={2} maxLength={2000} value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    className={`${inputClass} h-auto py-2`}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              {formError && <p role="alert" className="mb-3 text-sm font-medium text-red-500">{formError}</p>}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={save} disabled={isSaving}>{isSaving ? t("common.saving") : t("common.save")}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
