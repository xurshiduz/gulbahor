import { useTranslation } from "react-i18next";
import ReferenceCrud, { useReferenceList } from "../../components/reference/ReferenceCrud";
import { localized } from "../../utils/localized";
import {
  BLANK_CONTRACTOR, ContactCell, NameCell, commonFields, contractorSearch, contractorToForm, currencyOptions, namedOptions,
  type Contractor, type CurrencyRef, type Named,
} from "./shared";

/**
 * Yetkazib beruvchilar - ikki turga bo'linadi:
 *  - Mahalliy: O'zbekistondagi firma (STIR, viloyat, MFO);
 *  - Import: xorijiy firma (davlat, hisob-kitob valyutasi, SWIFT).
 * Forma maydonlari tanlangan turga qarab o'zgaradi.
 */
export default function Suppliers() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const regions = useReferenceList<Named>("/api/regions");
  const countries = useReferenceList<Named>("/api/countries");
  const currencies = useReferenceList<CurrencyRef>("/api/currencies");

  const kindOptions = [
    { value: "LOCAL", label: t("contractors.kind_local") },
    { value: "IMPORT", label: t("contractors.kind_import") },
  ];

  return (
    <ReferenceCrud<Contractor>
      resource="suppliers"
      endpoint="/api/suppliers"
      title={t("modules.suppliers.title")}
      wide
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => <NameCell row={row} /> },
        {
          key: "kind",
          label: t("contractors.kind"),
          render: (row) => (
            <span
              className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${
                row.supplierKind === "IMPORT"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              }`}
            >
              {row.supplierKind === "IMPORT" ? t("contractors.kind_import") : t("contractors.kind_local")}
            </span>
          ),
        },
        {
          key: "location",
          label: t("contractors.location"),
          // Importda davlat, mahalliyda viloyat
          render: (row) => localized(row.supplierKind === "IMPORT" ? row.country?.name : row.region?.name, lang) || "—",
        },
        { key: "contact", label: t("contractors.contacts"), render: (row) => <ContactCell row={row} /> },
        { key: "inn", label: t("contractors.inn"), render: (row) => row.inn || "—", className: "font-mono text-xs" },
        { key: "currency", label: t("contractors.currency_short"), render: (row) => row.currency?.code || "—", className: "font-mono text-xs" },
      ]}
      fields={({ form }) => {
        const isImport = form.supplierKind === "IMPORT";
        return [
          { kind: "section", label: t("contractors.section_main") },
          {
            name: "supplierKind", label: t("contractors.kind"), kind: "select", required: true, options: kindOptions,
            hint: form.supplierKind ? t(isImport ? "contractors.kind_hint_import" : "contractors.kind_hint_local") : undefined,
          },
          { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 160 },
          { name: "fullName", label: t("contractors.full_name"), kind: "text", maxLength: 255 },
          ...(isImport
            ? ([
                { name: "countryId", label: t("ref.country"), kind: "select", required: true, options: namedOptions(countries, lang), half: true },
              ] as const)
            : ([
                { name: "inn", label: t("contractors.inn"), kind: "text", digitsOnly: true, maxLength: 9, hint: t("contractors.inn_hint"), half: true },
                { name: "regionId", label: t("contractors.region"), kind: "select", options: namedOptions(regions, lang), half: true },
              ] as const)),
          { name: "currencyId", label: t("contractors.currency"), kind: "select", options: currencyOptions(currencies), half: true },

          { kind: "section", label: t("contractors.section_contacts") },
          ...commonFields(t, isImport),
        ];
      }}
      blank={BLANK_CONTRACTOR}
      toForm={contractorToForm}
      searchText={(row) => contractorSearch(row, lang)}
      rowName={(row) => row.name}
      filter={{
        allLabel: t("contractors.all_kinds"),
        options: kindOptions,
        match: (row, value) => row.supplierKind === value,
      }}
    />
  );
}
