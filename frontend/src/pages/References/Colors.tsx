import { useTranslation } from "react-i18next";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";
import { EMPTY_LOCALIZED, localized, localizedSearch, type LocalizedName } from "../../utils/localized";

interface Color extends RefRow {
  name: LocalizedName;
  hex: string | null;
  code: string | null;
}

/** Ranglar - nomi uch tilda, ekranda ko'rsatish uchun rang kodi bilan */
export default function Colors() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <ReferenceCrud<Color>
      resource="colors"
      endpoint="/api/colors"
      title={t("modules.colors.title")}
      columns={[
        {
          key: "name",
          label: t("ref.name"),
          className: "font-medium text-gray-900 dark:text-white",
          render: (row) => (
            <span className="flex items-center gap-2.5">
              {/* Rang namunasi; kodi kiritilmagan bo'lsa chiziqli bo'sh katak */}
              <span
                className={`h-5 w-5 shrink-0 rounded-full border border-gray-300 dark:border-gray-600 ${row.hex ? "" : "border-dashed"}`}
                style={row.hex ? { backgroundColor: row.hex } : undefined}
              />
              {localized(row.name, lang)}
            </span>
          ),
        },
        { key: "ru", label: "RU", render: (row) => row.name.ru, className: "text-gray-500 dark:text-gray-400" },
        { key: "en", label: "EN", render: (row) => row.name.en || "—", className: "text-gray-500 dark:text-gray-400" },
        { key: "hex", label: t("colors.hex"), render: (row) => row.hex || "—", className: "font-mono text-xs" },
        { key: "code", label: t("colors.code"), render: (row) => row.code || "—", className: "font-mono text-xs" },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "localized", required: true },
        { name: "hex", label: t("colors.hex"), kind: "color", half: true },
        { name: "code", label: t("colors.code"), kind: "text", maxLength: 40, hint: t("colors.code_hint"), half: true },
      ]}
      blank={{ name: EMPTY_LOCALIZED, hex: "", code: "" }}
      toForm={(row) => ({ name: { ...EMPTY_LOCALIZED, ...row.name, en: row.name.en || "" }, hex: row.hex || "", code: row.code || "" })}
      searchText={(row) => `${localizedSearch(row.name)} ${row.hex || ""} ${row.code || ""}`}
      rowName={(row) => localized(row.name, lang)}
    />
  );
}
