import { useTranslation } from "react-i18next";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";

interface Organization extends RefRow {
  name: string;
  fullName: string | null;
  inn: string | null;
  vatCode: string | null;
  oked: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  director: string | null;
  accountant: string | null;
  bankName: string | null;
  bankAccount: string | null;
  mfo: string | null;
}

const TEXT_KEYS = [
  "name", "fullName", "inn", "vatCode", "oked", "address", "phone", "email",
  "director", "accountant", "bankName", "bankAccount", "mfo",
] as const;

const BLANK = Object.fromEntries(TEXT_KEYS.map((key) => [key, ""]));

/** Tashkilotlar - nomi va rekvizitlari (STIR, bank, rahbar). Hujjatlar shundan to'ldiriladi */
export default function Organizations() {
  const { t } = useTranslation();

  return (
    <ReferenceCrud<Organization>
      resource="organizations"
      endpoint="/api/organizations"
      title={t("modules.organizations.title")}
      wide
      columns={[
        {
          key: "name",
          label: t("ref.name"),
          render: (row) => (
            <span>
              <span className="block font-medium text-gray-900 dark:text-white">{row.name}</span>
              {row.fullName && <span className="block text-xs text-gray-500 dark:text-gray-400">{row.fullName}</span>}
            </span>
          ),
        },
        { key: "inn", label: t("organizations.inn"), render: (row) => row.inn || "—", className: "font-mono text-xs" },
        {
          key: "bank",
          label: t("organizations.bank"),
          render: (row) =>
            row.bankAccount || row.bankName ? (
              <span>
                <span className="block font-mono text-xs">{row.bankAccount || "—"}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {[row.bankName, row.mfo && `${t("organizations.mfo")} ${row.mfo}`].filter(Boolean).join(" · ")}
                </span>
              </span>
            ) : "—",
        },
        { key: "director", label: t("organizations.director"), render: (row) => row.director || "—" },
        { key: "phone", label: t("ref.phone"), render: (row) => row.phone || "—", className: "whitespace-nowrap" },
      ]}
      fields={() => [
        { kind: "section", label: t("organizations.section_main") },
        { name: "name", label: t("organizations.short_name"), kind: "text", required: true, maxLength: 160, placeholder: "Gulbahor Tekstil" },
        { name: "fullName", label: t("organizations.full_name"), kind: "text", maxLength: 255, placeholder: "\"GULBAHOR TEKSTIL\" MChJ" },
        { name: "inn", label: t("organizations.inn"), kind: "text", digitsOnly: true, maxLength: 9, hint: t("organizations.digits", { count: 9 }), half: true },
        { name: "vatCode", label: t("organizations.vat_code"), kind: "text", digitsOnly: true, maxLength: 12, hint: t("organizations.digits", { count: 12 }), half: true },
        { name: "oked", label: t("organizations.oked"), kind: "text", digitsOnly: true, maxLength: 6, half: true },
        { name: "director", label: t("organizations.director"), kind: "text", maxLength: 160, half: true },
        { name: "accountant", label: t("organizations.accountant"), kind: "text", maxLength: 160, half: true },

        { kind: "section", label: t("organizations.section_bank") },
        { name: "bankName", label: t("organizations.bank_name"), kind: "text", maxLength: 160 },
        { name: "bankAccount", label: t("organizations.bank_account"), kind: "text", digitsOnly: true, maxLength: 20, hint: t("organizations.digits", { count: 20 }), half: true },
        { name: "mfo", label: t("organizations.mfo"), kind: "text", digitsOnly: true, maxLength: 5, hint: t("organizations.digits", { count: 5 }), half: true },

        { kind: "section", label: t("organizations.section_contacts") },
        { name: "address", label: t("ref.address"), kind: "text", maxLength: 255 },
        { name: "phone", label: t("ref.phone"), kind: "text", maxLength: 30, placeholder: "+998 71 123 45 67", half: true },
        { name: "email", label: "Email", kind: "text", maxLength: 120, half: true },
      ]}
      blank={BLANK}
      toForm={(row) => Object.fromEntries(TEXT_KEYS.map((key) => [key, row[key] || ""]))}
      searchText={(row) => TEXT_KEYS.map((key) => row[key] || "").join(" ")}
      rowName={(row) => row.name}
    />
  );
}
