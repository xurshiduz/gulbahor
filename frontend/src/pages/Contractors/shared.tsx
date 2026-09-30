import type { TFunction } from "i18next";
import type { RefField, RefOption, RefRow } from "../../components/reference/ReferenceCrud";
import { localized, type LocalizedName } from "../../utils/localized";

export interface Named { id: string; name: LocalizedName }
export interface CurrencyRef { id: string; name: string; code: string }

/** Mijoz ham, yetkazib beruvchi ham shu shaklda keladi */
export interface Contractor extends RefRow {
  supplierKind: "LOCAL" | "IMPORT" | null;
  name: string;
  fullName: string | null;
  inn: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  /** Tug'ilgan kun (YYYY-MM-DD) - faqat mijozda */
  birthDate: string | null;
  countryId: string | null;
  country: Named | null;
  regionId: string | null;
  region: Named | null;
  address: string | null;
  currencyId: string | null;
  currency: CurrencyRef | null;
  bankName: string | null;
  bankAccount: string | null;
  bankCode: string | null;
  note: string | null;
}

const KEYS = [
  "supplierKind", "name", "fullName", "inn", "contactPerson", "phone", "email", "birthDate", "countryId", "regionId",
  "address", "currencyId", "bankName", "bankAccount", "bankCode", "note",
] as const;

export const BLANK_CONTRACTOR: Record<string, string> = Object.fromEntries(KEYS.map((key) => [key, ""]));

export const contractorToForm = (row: Contractor) =>
  Object.fromEntries(KEYS.map((key) => [key, row[key] || ""]));

export const contractorSearch = (row: Contractor, lang: string) =>
  [
    row.name, row.fullName, row.inn, row.contactPerson, row.phone, row.email, row.address,
    localized(row.country?.name, lang), localized(row.region?.name, lang),
  ].filter(Boolean).join(" ");

export const namedOptions = (rows: Named[], lang: string): RefOption[] =>
  rows.map((row) => ({ value: row.id, label: localized(row.name, lang) }));

export const currencyOptions = (rows: CurrencyRef[]): RefOption[] =>
  rows.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` }));

/** Jadvaldagi "Nomi" katagi: qisqa nom, ostida to'liq nomi */
export function NameCell({ row }: { row: Contractor }) {
  return (
    <span>
      <span className="block font-medium text-gray-900 dark:text-white">{row.name}</span>
      {row.fullName && <span className="block text-xs text-gray-500 dark:text-gray-400">{row.fullName}</span>}
    </span>
  );
}

/** Jadvaldagi "Aloqa" katagi: shaxs va telefon */
export function ContactCell({ row }: { row: Contractor }) {
  if (!row.contactPerson && !row.phone) return <>—</>;
  return (
    <span>
      {row.contactPerson && <span className="block">{row.contactPerson}</span>}
      {row.phone && <span className="block whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{row.phone}</span>}
    </span>
  );
}

/** Forma oxiridagi umumiy qism: aloqa, manzil, bank, izoh. `foreign` - xorijiy bank (SWIFT, IBAN) */
export function commonFields(t: TFunction, foreign: boolean): RefField[] {
  return [
    { name: "contactPerson", label: t("contractors.contact"), kind: "text", maxLength: 160, half: true },
    { name: "phone", label: t("ref.phone"), kind: "text", maxLength: 30, placeholder: "+998 90 123 45 67", half: true },
    { name: "email", label: "Email", kind: "text", maxLength: 120, half: true },
    { name: "address", label: t("ref.address"), kind: "text", maxLength: 255, half: true },

    { kind: "section", label: t("contractors.section_bank") },
    { name: "bankName", label: t("contractors.bank_name"), kind: "text", maxLength: 160 },
    { name: "bankAccount", label: t("contractors.bank_account"), kind: "text", maxLength: foreign ? 34 : 20, digitsOnly: !foreign, half: true },
    {
      name: "bankCode",
      label: foreign ? t("contractors.bank_code_import") : t("contractors.bank_code_local"),
      kind: "text", maxLength: foreign ? 11 : 5, digitsOnly: !foreign, half: true,
    },
    { name: "note", label: t("contractors.note"), kind: "textarea", maxLength: 1000 },
  ];
}
