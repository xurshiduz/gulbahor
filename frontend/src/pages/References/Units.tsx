import { useTranslation } from "react-i18next";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";
import { EMPTY_LOCALIZED, localized, localizedSearch, type LocalizedName } from "../../utils/localized";

interface Unit extends RefRow {
  name: LocalizedName;
  shortName: LocalizedName;
}

const fill = (name: LocalizedName) => ({ ...EMPTY_LOCALIZED, ...name, en: name?.en || "" });

/** O'lchov birliklari: to'liq nomi va hujjatlardagi qisqartmasi uch tilda */
export default function Units() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <ReferenceCrud<Unit>
      resource="product-units"
      endpoint="/api/product-units"
      title={t("modules.units.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => localized(row.name, lang), className: "font-medium text-gray-900 dark:text-white" },
        { key: "short", label: t("units.short_name"), render: (row) => localized(row.shortName, lang) },
        { key: "ru", label: "RU", render: (row) => `${row.name.ru} (${row.shortName.ru})`, className: "text-gray-500 dark:text-gray-400" },
        { key: "en", label: "EN", render: (row) => (row.name.en ? `${row.name.en} (${row.shortName.en || "—"})` : "—"), className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "localized", required: true },
        { name: "shortName", label: t("units.short_name"), kind: "localized", required: true, hint: t("units.short_hint") },
      ]}
      blank={{ name: EMPTY_LOCALIZED, shortName: EMPTY_LOCALIZED }}
      toForm={(row) => ({ name: fill(row.name), shortName: fill(row.shortName) })}
      searchText={(row) => `${localizedSearch(row.name)} ${localizedSearch(row.shortName)}`}
      rowName={(row) => localized(row.name, lang)}
    />
  );
}
