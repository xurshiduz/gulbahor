import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";

interface Size extends RefRow {
  name: string;
  scale: string | null;
  sortOrder: number;
}

/**
 * O'lchamlar. Nomi tarjima qilinmaydi ("M", "42"). Shkala - o'lchamlar
 * guruhi (Alfa, Raqamli, Poyabzal...): bitta nom turli shkalada bo'lishi mumkin.
 */
export default function Sizes() {
  const { t } = useTranslation();
  // Filtr uchun mavjud shkalalar (ro'yxat ochilganda bir marta olinadi)
  const all = useReferenceList<Size>("/api/sizes");
  const scales = useMemo(
    () => [...new Set(all.map((s) => s.scale).filter(Boolean) as string[])].sort(),
    [all],
  );

  return (
    <ReferenceCrud<Size>
      resource="sizes"
      endpoint="/api/sizes"
      title={t("modules.sizes.title")}
      columns={[
        { key: "name", label: t("sizes.size"), render: (row) => row.name, className: "font-semibold text-gray-900 dark:text-white" },
        { key: "scale", label: t("sizes.scale"), render: (row) => row.scale || "—" },
        { key: "sortOrder", label: t("ref.sort_order"), render: (row) => row.sortOrder, className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("sizes.size"), kind: "text", required: true, maxLength: 40, placeholder: "XL", half: true },
        { name: "scale", label: t("sizes.scale"), kind: "text", maxLength: 60, placeholder: "Alfa", half: true },
        { name: "sortOrder", label: t("ref.sort_order"), kind: "number", hint: t("sizes.sort_hint"), half: true },
      ]}
      blank={{ name: "", scale: "", sortOrder: 0 }}
      toForm={(row) => ({ name: row.name, scale: row.scale || "", sortOrder: row.sortOrder })}
      searchText={(row) => `${row.name} ${row.scale || ""}`}
      rowName={(row) => (row.scale ? `${row.name} (${row.scale})` : row.name)}
      filter={{
        allLabel: t("sizes.all_scales"),
        options: scales.map((scale) => ({ value: scale, label: scale })),
        match: (row, value) => row.scale === value,
      }}
    />
  );
}
