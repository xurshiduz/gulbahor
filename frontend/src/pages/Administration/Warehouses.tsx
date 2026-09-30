import { useTranslation } from "react-i18next";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";

interface Branch { id: string; name: string }

interface Warehouse extends RefRow {
  name: string;
  branchId: string;
  branch: Branch | null;
  responsibleName: string | null;
  address: string | null;
}

/** Omborxonalar - har biri bitta filialga tegishli */
export default function Warehouses() {
  const { t } = useTranslation();
  const branches = useReferenceList<Branch>("/api/branches");
  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <ReferenceCrud<Warehouse>
      resource="warehouses"
      endpoint="/api/warehouses"
      title={t("modules.warehouses.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white" },
        { key: "branch", label: t("ref.branch"), render: (row) => row.branch?.name || "—" },
        { key: "responsible", label: t("ref.responsible"), render: (row) => row.responsibleName || "—" },
        { key: "address", label: t("ref.address"), render: (row) => row.address || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("warehouses.name"), kind: "text", required: true, maxLength: 160 },
        { name: "branchId", label: t("ref.branch"), kind: "select", required: true, options: branchOptions, hint: branches.length ? undefined : t("warehouses.no_branches") },
        { name: "responsibleName", label: t("ref.responsible"), kind: "text", maxLength: 160 },
        { name: "address", label: t("ref.address"), kind: "text", maxLength: 255 },
      ]}
      blank={{ name: "", branchId: "", responsibleName: "", address: "" }}
      toForm={(row) => ({ name: row.name, branchId: row.branchId, responsibleName: row.responsibleName || "", address: row.address || "" })}
      searchText={(row) => [row.name, row.branch?.name, row.responsibleName, row.address].filter(Boolean).join(" ")}
      rowName={(row) => row.name}
      filter={{
        allLabel: t("warehouses.all_branches"),
        options: branchOptions,
        match: (row, value) => row.branchId === value,
      }}
    />
  );
}
