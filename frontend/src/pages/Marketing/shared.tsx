import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import dayjs from "dayjs";
import { Plus, Trash2 } from "lucide-react";
import type { RefColumn, RefField, RefOption, RefRow } from "../../components/reference/ReferenceCrud";
import { normalizeSearch } from "../../config/modules";
import { localized, type LocalizedName } from "../../utils/localized";

export interface CategoryRef { id: string; name: LocalizedName; parentId: string | null }
export interface MaterialRef { id: string; name: string; sku: string | null }
export interface Tier { quantity: number | string; percent: number | string }

/** To'rt tur aksiya shu shaklda keladi; har bir tur o'z maydonlarini ishlatadi */
export interface Promotion extends RefRow {
  name: string;
  startDate: string | null;
  endDate: string | null;
  appliesTo: "ALL" | "CATEGORIES" | "MATERIALS";
  categories: CategoryRef[];
  materials: MaterialRef[];
  discountKind: "PERCENT" | "AMOUNT" | "PRICE" | null;
  value: number | null;
  buyQuantity: number | null;
  giftQuantity: number | null;
  tiers: { quantity: number; percent: number }[] | null;
  minAmount: number | null;
  note: string | null;
}

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
export const formatMoney = (value: number | null | undefined) => (value === null || value === undefined ? "—" : money.format(value));

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

/** Kategoriyalar to'liq yo'li bilan: "Erkaklar kiyimi / Shimlar" */
export function categoryOptions(categories: CategoryRef[], lang: string): RefOption[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (c: CategoryRef): string => {
    const parent = c.parentId ? byId.get(c.parentId) : null;
    return parent ? `${path(parent)} / ${localized(c.name, lang)}` : localized(c.name, lang);
  };
  return categories.map((c) => ({ value: c.id, label: path(c) })).sort((a, b) => a.label.localeCompare(b.label));
}

export const materialOptions = (materials: MaterialRef[]): RefOption[] =>
  materials.map((m) => ({ value: m.id, label: m.sku ? `${m.name} · ${m.sku}` : m.name }));

/** Bir nechtasini belgilash ro'yxati: qidiruv + katakchalar */
export function CheckList({ options, value, onChange, t }: {
  options: RefOption[];
  value: string[];
  onChange: (next: string[]) => void;
  t: TFunction;
}) {
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(value || []), [value]);
  const query = normalizeSearch(search);
  const shown = query ? options.filter((o) => normalizeSearch(o.label).includes(query)) : options;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="rounded-lg border border-gray-300 dark:border-gray-700">
      <div className="flex items-center gap-2 border-b border-gray-200 p-2 dark:border-gray-700">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common.search")}
          className="h-8 w-full rounded-md border border-gray-200 bg-transparent px-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:text-white"
        />
        <span className="shrink-0 text-xs text-gray-500">{t("marketing.selected", { count: selected.size })}</span>
      </div>
      <div className="max-h-44 overflow-y-auto custom-scrollbar p-1">
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-gray-500">{t("ref.empty")}</p>
        ) : (
          shown.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5">
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
              />
              {option.label}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

/** Karusel bosqichlari: "nechanchi dona = necha foiz" qatorlari */
export function TiersEditor({ value, onChange, t }: { value: Tier[]; onChange: (next: Tier[]) => void; t: TFunction }) {
  const tiers = value?.length ? value : [{ quantity: 1, percent: "" }];
  const update = (index: number, patch: Partial<Tier>) => onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));

  return (
    <div className="space-y-2">
      {tiers.map((tier, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="number" min={1} value={tier.quantity}
            onChange={(e) => update(index, { quantity: e.target.value })}
            aria-label={t("marketing.tier_quantity")}
            className={`${inputClass} w-24`}
          />
          <span className="shrink-0 text-sm text-gray-500">{t("marketing.tier_pieces")} =</span>
          <input
            type="number" min={0} max={100} step="0.01" value={tier.percent}
            onChange={(e) => update(index, { percent: e.target.value })}
            aria-label={t("marketing.tier_percent")}
            className={`${inputClass} w-24`}
          />
          <span className="text-sm text-gray-500">%</span>
          {tiers.length > 1 && (
            <button type="button" onClick={() => onChange(tiers.filter((_, i) => i !== index))} aria-label={t("common.delete")} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {tiers.length < 10 && (
        <button
          type="button"
          onClick={() => onChange([...tiers, { quantity: Number(tiers[tiers.length - 1].quantity || 0) + 1, percent: "" }])}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:underline"
        >
          <Plus className="h-4 w-4" /> {t("marketing.tier_add")}
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Umumiy maydon va ustunlar ----------------------------- */

/** Nom va amal qilish muddati - hamma aksiyada */
export function headFields(t: TFunction): RefField[] {
  return [
    { name: "name", label: t("marketing.name"), kind: "text", required: true, maxLength: 160 },
    { name: "startDate", label: t("marketing.start_date"), kind: "date", half: true },
    { name: "endDate", label: t("marketing.end_date"), kind: "date", half: true, hint: t("marketing.period_hint") },
  ];
}

/** Aksiya qaysi tovarlarga tegishli: hammasi / kategoriyalar / tanlangan materiallar */
export function scopeFields(t: TFunction, form: Record<string, any>, categories: RefOption[], materials: RefOption[]): RefField[] {
  const fields: RefField[] = [
    { kind: "section", label: t("marketing.section_scope") },
    {
      name: "appliesTo", label: t("marketing.applies_to"), kind: "select", required: true,
      options: [
        { value: "ALL", label: t("marketing.scope_all") },
        { value: "CATEGORIES", label: t("marketing.scope_categories") },
        { value: "MATERIALS", label: t("marketing.scope_materials") },
      ],
    },
  ];
  if (form.appliesTo === "CATEGORIES") {
    fields.push({
      name: "categoryIds", label: t("marketing.categories"), kind: "custom", hint: t("marketing.categories_hint"),
      render: (value, onChange) => <CheckList options={categories} value={value || []} onChange={onChange} t={t} />,
      validate: (value) => (value?.length ? null : t("marketing.categories_required")),
    });
  }
  if (form.appliesTo === "MATERIALS") {
    fields.push({
      name: "materialIds", label: t("marketing.materials"), kind: "custom",
      render: (value, onChange) => <CheckList options={materials} value={value || []} onChange={onChange} t={t} />,
      validate: (value) => (value?.length ? null : t("marketing.materials_required")),
    });
  }
  return fields;
}

export const noteField = (t: TFunction): RefField => ({ name: "note", label: t("contractors.note"), kind: "textarea", maxLength: 1000 });

export const BLANK_PROMOTION = { name: "", startDate: "", endDate: "", appliesTo: "ALL", categoryIds: [], materialIds: [], note: "" };

export const promotionToForm = (row: Promotion) => ({
  name: row.name,
  startDate: row.startDate || "",
  endDate: row.endDate || "",
  appliesTo: row.appliesTo,
  categoryIds: (row.categories || []).map((c) => c.id),
  materialIds: (row.materials || []).map((m) => m.id),
  note: row.note || "",
});

const date = (value: string | null) => (value ? dayjs(value).format("DD.MM.YYYY") : "…");

/** "Muddat" ustuni: sanalar va hozirgi holati (rejalashtirilgan / amalda / tugagan) */
export function periodColumn(t: TFunction): RefColumn<Promotion> {
  return {
    key: "period",
    label: t("marketing.period"),
    className: "whitespace-nowrap",
    render: (row) => {
      const today = dayjs().format("YYYY-MM-DD");
      const state = row.endDate && row.endDate < today ? "ended" : row.startDate && row.startDate > today ? "planned" : "running";
      const color = { ended: "text-gray-400", planned: "text-blue-600 dark:text-blue-400", running: "text-green-600 dark:text-green-400" }[state];
      return (
        <span>
          <span className="block">{row.startDate || row.endDate ? `${date(row.startDate)} — ${date(row.endDate)}` : t("marketing.no_period")}</span>
          <span className={`block text-xs font-medium ${color}`}>{t(`marketing.state_${state}`)}</span>
        </span>
      );
    },
  };
}

/** "Tovarlar" ustuni: hammasi yoki tanlanganlar soni (nomi bilan) */
export function scopeColumn(t: TFunction, lang: string): RefColumn<Promotion> {
  return {
    key: "scope",
    label: t("marketing.applies_to"),
    render: (row) => {
      if (row.appliesTo === "ALL") return t("marketing.scope_all");
      const names = row.appliesTo === "CATEGORIES"
        ? row.categories.map((c) => localized(c.name, lang))
        : row.materials.map((m) => m.name);
      return (
        <span title={names.join(", ")}>
          {t(row.appliesTo === "CATEGORIES" ? "marketing.scope_categories" : "marketing.scope_materials")}: {names.slice(0, 2).join(", ")}
          {names.length > 2 && ` +${names.length - 2}`}
        </span>
      );
    },
  };
}

export const nameColumn = (t: TFunction): RefColumn<Promotion> => ({
  key: "name", label: t("marketing.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white",
});

export const promotionSearch = (row: Promotion) => `${row.name} ${row.note || ""}`;
