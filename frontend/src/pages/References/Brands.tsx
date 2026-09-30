import { useTranslation } from "react-i18next";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";
import { localized, type LocalizedName } from "../../utils/localized";

interface Country { id: string; name: LocalizedName }

interface Brand extends RefRow {
  name: string;
  countryId: string | null;
  country: Country | null;
  description: string | null;
}

/** Brendlar - nomi tarjima qilinmaydi, davlat ixtiyoriy */
export default function Brands() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const countries = useReferenceList<Country>("/api/countries");

  return (
    <ReferenceCrud<Brand>
      resource="product-brands"
      endpoint="/api/product-brands"
      title={t("modules.brands.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white" },
        { key: "country", label: t("ref.country"), render: (row) => (row.country ? localized(row.country.name, lang) : "—") },
        { key: "description", label: t("ref.description"), render: (row) => row.description || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 120, placeholder: "Zara" },
        {
          name: "countryId", label: t("ref.country"), kind: "select",
          options: countries.map((c) => ({ value: c.id, label: localized(c.name, lang) })),
        },
        { name: "description", label: t("ref.description"), kind: "textarea", maxLength: 500 },
      ]}
      blank={{ name: "", countryId: "", description: "" }}
      toForm={(row) => ({ name: row.name, countryId: row.countryId || "", description: row.description || "" })}
      searchText={(row) => `${row.name} ${row.description || ""}`}
      rowName={(row) => row.name}
    />
  );
}
