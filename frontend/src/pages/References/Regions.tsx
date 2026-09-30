import { useTranslation } from "react-i18next";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";
import { EMPTY_LOCALIZED, localized, localizedSearch, type LocalizedName } from "../../utils/localized";

interface Country { id: string; name: LocalizedName }

interface Region extends RefRow {
  name: LocalizedName;
  countryId: string;
  country: Country | null;
}

/** Viloyatlar - har biri bitta davlatga tegishli, nomi uch tilda */
export default function Regions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const countries = useReferenceList<Country>("/api/countries");
  const countryOptions = countries.map((c) => ({ value: c.id, label: localized(c.name, lang) }));

  return (
    <ReferenceCrud<Region>
      resource="regions"
      endpoint="/api/regions"
      title={t("modules.regions.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => localized(row.name, lang), className: "font-medium text-gray-900 dark:text-white" },
        { key: "country", label: t("ref.country"), render: (row) => (row.country ? localized(row.country.name, lang) : "—") },
        { key: "ru", label: "RU", render: (row) => row.name.ru, className: "text-gray-500 dark:text-gray-400" },
        { key: "en", label: "EN", render: (row) => row.name.en || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "countryId", label: t("ref.country"), kind: "select", required: true, options: countryOptions },
        { name: "name", label: t("ref.name"), kind: "localized", required: true },
      ]}
      blank={{ name: EMPTY_LOCALIZED, countryId: "" }}
      toForm={(row) => ({ name: { ...EMPTY_LOCALIZED, ...row.name, en: row.name.en || "" }, countryId: row.countryId })}
      searchText={(row) => `${localizedSearch(row.name)} ${localizedSearch(row.country?.name)}`}
      rowName={(row) => localized(row.name, lang)}
      filter={{
        allLabel: t("regions.all_countries"),
        options: countryOptions,
        match: (row, value) => row.countryId === value,
      }}
    />
  );
}
