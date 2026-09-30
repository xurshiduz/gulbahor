import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import ReferenceCrud, { useReferenceList } from "../../components/reference/ReferenceCrud";
import { localized } from "../../utils/localized";
import {
  BLANK_CONTRACTOR, ContactCell, NameCell, commonFields, contractorSearch, contractorToForm, namedOptions,
  type Contractor, type Named,
} from "./shared";

/** Mijozlar - tovar sotiladigan kontragentlar */
export default function Customers() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const regions = useReferenceList<Named>("/api/regions");
  const regionOptions = namedOptions(regions, lang);

  return (
    <ReferenceCrud<Contractor>
      resource="customers"
      endpoint="/api/customers"
      title={t("modules.customers.title")}
      wide
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => <NameCell row={row} /> },
        { key: "contact", label: t("contractors.contacts"), render: (row) => <ContactCell row={row} /> },
        { key: "birthDate", label: t("contractors.birth_date"), render: (row) => (row.birthDate ? dayjs(row.birthDate).format("DD.MM.YYYY") : "—"), className: "whitespace-nowrap" },
        { key: "inn", label: t("contractors.inn"), render: (row) => row.inn || "—", className: "font-mono text-xs" },
        { key: "region", label: t("contractors.region"), render: (row) => localized(row.region?.name, lang) || "—" },
        { key: "address", label: t("ref.address"), render: (row) => row.address || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { kind: "section", label: t("contractors.section_main") },
        { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 160 },
        { name: "fullName", label: t("contractors.full_name"), kind: "text", maxLength: 255 },
        { name: "birthDate", label: t("contractors.birth_date"), kind: "date", required: true, half: true },
        { name: "phone", label: t("ref.phone"), kind: "text", required: true, maxLength: 30, placeholder: "+998 90 123 45 67", half: true },
        { name: "inn", label: t("contractors.inn"), kind: "text", digitsOnly: true, maxLength: 9, hint: t("contractors.inn_hint"), half: true },
        { name: "regionId", label: t("contractors.region"), kind: "select", options: regionOptions, half: true },

        { kind: "section", label: t("contractors.section_contacts") },
        // Telefon yuqorida (majburiy) - umumiy qismdagisi takrorlanmasin
        ...commonFields(t, false).filter((field) => field.kind === "section" || field.name !== "phone"),
      ]}
      blank={BLANK_CONTRACTOR}
      toForm={contractorToForm}
      searchText={(row) => contractorSearch(row, lang)}
      rowName={(row) => row.name}
      filter={{
        allLabel: t("ref.all_regions"),
        options: regionOptions,
        match: (row, value) => row.regionId === value,
      }}
    />
  );
}
