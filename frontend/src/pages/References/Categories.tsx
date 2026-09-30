import { useTranslation } from "react-i18next";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";
import { EMPTY_LOCALIZED, localized, localizedSearch, type LocalizedName } from "../../utils/localized";

interface Category extends RefRow {
  name: LocalizedName;
  parentId: string | null;
  sortOrder: number;
}

/** Kategoriyaning o'zi va barcha avlodlari - ularni o'ziga ota qilib bo'lmaydi */
function descendantIds(rows: Category[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Kategoriyalar - ost kategoriyalari bilan daraxt ko'rinishida */
export default function Categories() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  /** Ota tanlash ro'yxati: to'liq yo'li bilan ("Erkaklar kiyimi / Shimlar") */
  const parentOptions = (rows: Category[], editing: Category | null) => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const blocked = editing ? descendantIds(rows, editing.id) : new Set<string>();
    const path = (row: Category): string => {
      const parent = row.parentId ? byId.get(row.parentId) : null;
      return parent ? `${path(parent)} / ${localized(row.name, lang)}` : localized(row.name, lang);
    };
    return rows
      .filter((row) => !blocked.has(row.id))
      .map((row) => ({ value: row.id, label: path(row) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  return (
    <ReferenceCrud<Category>
      resource="product-categories"
      endpoint="/api/product-categories"
      title={t("modules.categories.title")}
      tree
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => localized(row.name, lang) },
        { key: "ru", label: "RU", render: (row) => row.name.ru, className: "text-gray-500 dark:text-gray-400" },
        { key: "en", label: "EN", render: (row) => row.name.en || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={({ rows, editing }) => [
        { name: "parentId", label: t("categories.parent"), kind: "select", options: parentOptions(rows, editing), hint: t("categories.parent_hint") },
        { name: "name", label: t("ref.name"), kind: "localized", required: true },
        { name: "sortOrder", label: t("ref.sort_order"), kind: "number", hint: t("ref.sort_hint"), half: true },
      ]}
      blank={{ name: EMPTY_LOCALIZED, parentId: "", sortOrder: 0 }}
      toForm={(row) => ({ name: { ...EMPTY_LOCALIZED, ...row.name, en: row.name.en || "" }, parentId: row.parentId || "", sortOrder: row.sortOrder })}
      searchText={(row) => localizedSearch(row.name)}
      rowName={(row) => localized(row.name, lang)}
    />
  );
}
