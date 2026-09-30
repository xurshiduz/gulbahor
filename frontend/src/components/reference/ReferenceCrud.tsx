import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Edit, Plus, Search, Trash2, X } from "lucide-react";
import PageMeta from "../common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../common/Pagination";
import Button from "../ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { EMPTY_LOCALIZED, type LocalizedName } from "../../utils/localized";

/**
 * Ma'lumotnoma sahifasi: jadval + qo'shish/tahrirlash oynasi.
 *
 * Kategoriya, brend, rang, filial kabi sahifalar bir xil ishlaydi - farqi
 * faqat ustunlar va forma maydonlarida. Shuning uchun har bir sahifa shu
 * komponentga ustunlar (`columns`) va maydonlar (`fields`) ro'yxatini
 * beradi, xolos. "Holat" ustuni va "Faol" belgisi hammasida bor - ularni
 * komponent o'zi qo'shadi.
 */

export interface RefRow {
  id: string;
  isActive?: boolean;
  parentId?: string | null;
}

export interface RefColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export interface RefOption {
  value: string;
  label: string;
}

export type RefField =
  /** Forma ichidagi bo'lim sarlavhasi */
  | { kind: "section"; label: string }
  /** O'z ko'rinishiga ega maydon (ro'yxatdan belgilash, bosqichlar jadvali...) */
  | {
      name: string;
      label: string;
      kind: "custom";
      render: (value: any, onChange: (next: any) => void) => React.ReactNode;
      /** Xato bo'lsa matnini qaytaradi */
      validate?: (value: any) => string | null;
      /** Serverga yuborishdan oldin qiymatni o'zgartirish */
      toPayload?: (value: any) => unknown;
      required?: boolean;
      hint?: string;
      half?: boolean;
    }
  | {
      /** Formadagi (va serverga ketadigan) kalit */
      name: string;
      label: string;
      /** number - butun son (tartib raqami), decimal - kasrli son (kurs) */
      kind: "localized" | "text" | "textarea" | "number" | "decimal" | "date" | "color" | "select";
      required?: boolean;
      /** select uchun variantlar */
      options?: RefOption[];
      placeholder?: string;
      hint?: string;
      maxLength?: number;
      /** Faqat raqam qabul qilinadi (STIR, MFO, hisob raqami) */
      digitsOnly?: boolean;
      /** Qatorning yarmini egallaydi - ikkita maydon yonma-yon */
      half?: boolean;
    };

type FormValues = Record<string, any>;

interface Props<T extends RefRow> {
  /** Huquqlar shu resurs bo'yicha tekshiriladi: "colors" -> create:colors ... */
  resource: string;
  /** API manzili: "/api/colors" */
  endpoint: string;
  title: string;
  columns: RefColumn<T>[];
  /**
   * Forma maydonlari. `rows` va `editing` - kategoriyada ota tanlash uchun;
   * `form` - joriy qiymatlar: maydonlar tanlovga qarab o'zgarsa (mahalliy / import).
   */
  fields: (ctx: { rows: T[]; editing: T | null; form: FormValues }) => RefField[];
  /** Yangi yozuv uchun boshlang'ich qiymatlar */
  blank: FormValues;
  /** Tahrirlashda yozuvni forma qiymatlariga aylantiradi */
  toForm: (row: T) => FormValues;
  /** Qidiruv shu matn bo'yicha ishlaydi */
  searchText: (row: T) => string;
  /** O'chirishni tasdiqlash oynasida ko'rinadigan nom */
  rowName: (row: T) => string;
  /** Daraxt ko'rinishi: qatorlar `parentId` bo'yicha ichma-ich chiqadi */
  tree?: boolean;
  /** Yuqoridagi qo'shimcha filtr (masalan viloyatlarda davlat bo'yicha) */
  filter?: { allLabel: string; options: RefOption[]; match: (row: T, value: string) => boolean };
  /** Oyna kengligi - maydoni ko'p formalar uchun */
  wide?: boolean;
  /** "Holat" ustuni va "Faol" belgisi kerak emas (masalan valyuta kurslari) */
  noStatus?: boolean;
  /** Qatordagi qo'shimcha amallar (masalan sertifikatni sotish). `reload` - ro'yxatni yangilash */
  rowActions?: (row: T, reload: () => void) => React.ReactNode;
  /** Shu qatorni tahrirlash / o'chirish mumkinmi (huquqdan tashqari shart) */
  canEdit?: (row: T) => boolean;
  canRemove?: (row: T) => boolean;
}

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";

/** Boshqa ma'lumotnomadan ro'yxat (select variantlari uchun): davlatlar, filiallar... */
export function useReferenceList<T = any>(endpoint: string): T[] {
  const { token } = useAuth();
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
      .catch(() => { /* ro'yxat kelmasa select bo'sh qoladi */ });
    return () => { cancelled = true; };
  }, [endpoint, token]);

  return rows;
}

/** Jadvaldagi "Faol / Faol emas" belgisi */
export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${
        active
          ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      {active ? t("ref.active") : t("ref.inactive")}
    </span>
  );
}

/** Uch tildagi nom maydoni: UZ / RU / EN */
function LocalizedInput({ value, onChange, required }: {
  value: LocalizedName;
  onChange: (next: LocalizedName) => void;
  required?: boolean;
}) {
  const langs: { code: keyof LocalizedName; required: boolean }[] = [
    { code: "uz", required: !!required },
    { code: "ru", required: !!required },
    { code: "en", required: false },
  ];
  return (
    <div className="space-y-2">
      {langs.map(({ code, required: isRequired }) => (
        <div key={code} className="flex">
          <span className="inline-flex h-10 w-12 shrink-0 items-center justify-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {code}
            {isRequired && <span className="ml-0.5 text-red-500">*</span>}
          </span>
          <input
            type="text"
            maxLength={120}
            value={value?.[code] || ""}
            onChange={(e) => onChange({ ...value, [code]: e.target.value })}
            className={`${inputClass} rounded-l-none`}
          />
        </div>
      ))}
    </div>
  );
}

export default function ReferenceCrud<T extends RefRow>({
  resource, endpoint, title, columns, fields, blank, toForm, searchText, rowName, tree, filter, wide, noStatus, rowActions, canEdit, canRemove,
}: Props<T>) {
  const { t } = useTranslation();
  const { token, logout } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const mayCreate = canCreate(resource);
  const mayUpdate = canUpdate(resource);
  const mayDelete = canDelete(resource);
  const hasActions = mayUpdate || mayDelete || !!rowActions;

  const [rows, setRows] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  // Daraxtda yopilgan (bolalari yashirilgan) qatorlar
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<FormValues>(blank);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return logout();
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.load_error")));
      setRows(await res.json());
    } catch (err: any) {
      setLoadError(err.message || t("common.load_error"));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  /* ------------------------------ Ko'rinadigan qatorlar ------------------------------ */

  const query = normalizeSearch(search);
  const isFiltering = !!query || !!filterValue;

  /** Har bir qator chuqurligi va bolalari soni bilan; daraxt bo'lmasa chuqurlik 0 */
  const visible = useMemo(() => {
    const matches = (row: T) =>
      (!query || normalizeSearch(searchText(row)).includes(query)) &&
      (!filterValue || !filter || filter.match(row, filterValue));

    // Qidiruvda daraxt tekis ro'yxatga aylanadi - topilgan qator otasi yopiq bo'lsa ham ko'rinsin
    if (!tree || isFiltering) {
      return rows.filter(matches).map((row) => ({ row, depth: 0, childCount: 0 }));
    }

    const byParent = new Map<string, T[]>();
    for (const row of rows) {
      const key = row.parentId || "";
      byParent.set(key, [...(byParent.get(key) || []), row]);
    }
    const out: { row: T; depth: number; childCount: number }[] = [];
    const walk = (parentId: string, depth: number) => {
      for (const row of byParent.get(parentId) || []) {
        const children = byParent.get(row.id) || [];
        out.push({ row, depth, childCount: children.length });
        if (children.length && !collapsed.has(row.id)) walk(row.id, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [rows, tree, isFiltering, query, filterValue, filter, searchText, collapsed]);

  // Sahifalash: qidiruv yoki filtr o'zgarsa birinchi sahifaga qaytadi; qatorlar
  // kamayib sahifa bo'sh qolsa (o'chirish, daraxtni yopish) - oxirgi sahifaga
  useEffect(() => { setPage(1); }, [query, filterValue]);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  /* ----------------------------------- Forma ----------------------------------- */

  const formFields = useMemo(() => fields({ rows, editing, form }), [fields, rows, editing, form]);

  const openForm = (row?: T, preset?: FormValues) => {
    setEditing(row || null);
    setForm(row ? { ...blank, ...toForm(row), isActive: row.isActive !== false } : { ...blank, isActive: true, ...preset });
    setFormError("");
    setIsOpen(true);
  };

  const setValue = (name: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError("");
  };

  const save = async () => {
    const payload: FormValues = noStatus ? {} : { isActive: form.isActive !== false };

    for (const field of formFields) {
      if (field.kind === "section") continue;
      const value = form[field.name];
      if (field.kind === "custom") {
        const problem = field.validate?.(value);
        if (problem) return setFormError(problem);
        payload[field.name] = field.toPayload ? field.toPayload(value) : value;
        continue;
      }
      const missing = () => setFormError(t("ref.required_field", { field: field.label }));

      if (field.kind === "localized") {
        const name = { uz: (value?.uz || "").trim(), ru: (value?.ru || "").trim(), en: (value?.en || "").trim() };
        if (field.required && (!name.uz || !name.ru)) return missing();
        payload[field.name] = name;
      } else if (field.kind === "number") {
        payload[field.name] = Number(value) || 0;
      } else if (field.kind === "decimal") {
        // Vergul bilan yozilgan kasr ham qabul qilinadi: "12650,5"
        const amount = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(amount) || amount <= 0) return missing();
        payload[field.name] = amount;
      } else {
        const text = String(value ?? "").trim();
        if (field.required && !text) return missing();
        // Tanlanmagan select - null (bog'lanishni olib tashlash)
        payload[field.name] = field.kind === "select" && !text ? null : text;
      }
    }

    try {
      setIsSaving(true);
      setFormError("");
      const res = await fetch(editing ? `${endpoint}/${editing.id}` : endpoint, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  const remove = async (row: T) => {
    if (!window.confirm(t("ref.delete_confirm", { name: rowName(row) }))) return;
    try {
      const res = await fetch(`${endpoint}/${row.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("users.delete_error")));
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const renderField = (field: Exclude<RefField, { kind: "section" }>) => {
    const value = form[field.name];
    if (field.kind === "custom") return field.render(value, (next) => setValue(field.name, next));
    switch (field.kind) {
      case "localized":
        return <LocalizedInput value={value || EMPTY_LOCALIZED} onChange={(next) => setValue(field.name, next)} required={field.required} />;
      case "textarea":
        return (
          <textarea
            rows={3}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={value || ""}
            onChange={(e) => setValue(field.name, e.target.value)}
            className={`${inputClass} h-auto py-2`}
          />
        );
      case "select":
        return (
          <select value={value || ""} onChange={(e) => setValue(field.name, e.target.value)} className={inputClass}>
            <option value="">{field.required ? t("ref.choose") : t("ref.not_selected")}</option>
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        );
      case "color":
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#ffffff"}
              onChange={(e) => setValue(field.name, e.target.value.toUpperCase())}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700"
            />
            <input
              type="text"
              maxLength={7}
              placeholder="#RRGGBB"
              value={value || ""}
              onChange={(e) => setValue(field.name, e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        );
      case "date":
        return <input type="date" value={value || ""} onChange={(e) => setValue(field.name, e.target.value)} className={inputClass} />;
      case "decimal":
        return (
          <input
            type="text"
            inputMode="decimal"
            placeholder={field.placeholder}
            value={value ?? ""}
            onChange={(e) => setValue(field.name, e.target.value.replace(/[^\d.,\s]/g, ""))}
            className={inputClass}
          />
        );
      case "number":
        return (
          <input
            type="number"
            min={0}
            value={value ?? 0}
            onChange={(e) => setValue(field.name, e.target.value)}
            className={inputClass}
          />
        );
      default:
        return (
          <input
            type="text"
            inputMode={field.digitsOnly ? "numeric" : undefined}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={value || ""}
            onChange={(e) =>
              setValue(field.name, field.digitsOnly ? e.target.value.replace(/\D/g, "") : e.target.value)
            }
            className={inputClass}
          />
        );
    }
  };

  const columnCount = columns.length + (noStatus ? 0 : 1) + (hasActions ? 1 : 0);
  const th = "px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";

  return (
    <>
      <PageMeta title={`${title} | Gulbahor`} description={title} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        {/* Yuqori panel */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">{title}</h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {filter && (
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                <option value="">{filter.allLabel}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t("common.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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

        {/* Jadval */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={th}>{column.label}</th>
                ))}
                {!noStatus && <th className={th}>{t("ref.status")}</th>}
                {hasActions && <th className={`${th} text-right`}>{t("users.actions")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
              ) : loadError ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-red-500">{loadError}</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-gray-500">{t("ref.empty")}</td></tr>
              ) : (
                pageRows.map(({ row, depth, childCount }) => (
                  <tr key={row.id} className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                    {columns.map((column, index) => (
                      <td key={column.key} className={`px-4 md:px-6 py-2.5 text-sm text-gray-700 dark:text-gray-300 ${column.className || ""}`}>
                        {index === 0 && tree && !isFiltering ? (
                          // Birinchi ustun: daraja bo'yicha surilgan, bolalari bo'lsa ochib-yopish tugmasi bilan
                          <span className="flex items-center gap-1" style={{ paddingLeft: depth * 22 }}>
                            {childCount > 0 ? (
                              <button
                                onClick={() => toggleCollapsed(row.id)}
                                aria-label={collapsed.has(row.id) ? t("ref.expand") : t("ref.collapse")}
                                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                              >
                                {collapsed.has(row.id) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            ) : (
                              <span className="w-5" />
                            )}
                            <span className={depth === 0 ? "font-semibold text-gray-900 dark:text-white" : ""}>{column.render(row)}</span>
                            {childCount > 0 && (
                              <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800">{childCount}</span>
                            )}
                          </span>
                        ) : (
                          column.render(row)
                        )}
                      </td>
                    ))}
                    {!noStatus && (
                      <td className="px-4 md:px-6 py-2.5 whitespace-nowrap"><ActiveBadge active={row.isActive !== false} /></td>
                    )}
                    {hasActions && (
                      <td className="px-4 md:px-6 py-2.5 whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-3.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                          {rowActions?.(row, load)}
                          {tree && mayCreate && (
                            <button
                              onClick={() => openForm(undefined, { parentId: row.id })}
                              title={t("ref.add_child")}
                              aria-label={t("ref.add_child")}
                              className="text-gray-400 hover:text-green-600"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                          {mayUpdate && (!canEdit || canEdit(row)) && (
                            <button onClick={() => openForm(row)} title={t("common.edit")} aria-label={t("common.edit")} className="text-gray-400 hover:text-brand-500">
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          {mayDelete && (!canRemove || canRemove(row)) && (
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
          total={isFiltering ? visible.length : rows.length}
          overall={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </div>

      {/* Qo'shish / tahrirlash oynasi */}
      {isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900 ${wide ? "max-w-2xl" : "max-w-md"}`}>
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {title}: {editing ? t("common.edit").toLowerCase() : t("common.add").toLowerCase()}
              </h3>
              <button onClick={() => setIsOpen(false)} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                {formFields.map((field, index) =>
                  field.kind === "section" ? (
                    <h4 key={`section-${index}`} className="col-span-2 border-b border-gray-200 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800">
                      {field.label}
                    </h4>
                  ) : (
                    <div key={field.name} className={field.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {field.label}
                        {field.required && field.kind !== "localized" && <span className="ml-0.5 text-red-500">*</span>}
                      </label>
                      {renderField(field)}
                      {field.hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.hint}</p>}
                    </div>
                  ),
                )}

                {!noStatus && (
                  <label className="col-span-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isActive !== false}
                      onChange={(e) => setValue("isActive", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t("ref.is_active")}</span>
                  </label>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              {formError && <p className="mb-3 text-sm font-medium text-red-500">{formError}</p>}
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
