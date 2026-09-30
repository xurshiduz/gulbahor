import { useTranslation } from "react-i18next";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";
import { EMPTY_LOCALIZED, localized, localizedSearch, type LocalizedName } from "../../utils/localized";

interface Country extends RefRow {
  name: LocalizedName;
  code: string | null;
}

/** Davlatlar - nomi uch tilda, ISO kodi bilan */
export default function Countries() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <ReferenceCrud<Country>
      resource="countries"
      endpoint="/api/countries"
      title={t("modules.countries.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => localized(row.name, lang), className: "font-medium text-gray-900 dark:text-white" },
        { key: "ru", label: "RU", render: (row) => row.name.ru, className: "text-gray-500 dark:text-gray-400" },
        { key: "en", label: "EN", render: (row) => row.name.en || "—", className: "text-gray-500 dark:text-gray-400" },
        { key: "code", label: t("countries.code"), render: (row) => row.code || "—", className: "font-mono text-xs" },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "localized", required: true },
        { name: "code", label: t("countries.code"), kind: "text", maxLength: 3, placeholder: "UZ", hint: t("countries.code_hint"), half: true },
      ]}
      blank={{ name: EMPTY_LOCALIZED, code: "" }}
      toForm={(row) => ({ name: { ...EMPTY_LOCALIZED, ...row.name, en: row.name.en || "" }, code: row.code || "" })}
      searchText={(row) => `${localizedSearch(row.name)} ${row.code || ""}`}
      rowName={(row) => localized(row.name, lang)}
    />
  );
}
