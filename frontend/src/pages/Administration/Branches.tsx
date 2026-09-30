import { useTranslation } from "react-i18next";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";

interface Organization { id: string; name: string }

interface Branch extends RefRow {
  name: string;
  responsibleName: string | null;
  phone: string | null;
  address: string | null;
  organizationId: string | null;
  organization: Organization | null;
}

/** Filiallar - nomi va mas'ul shaxsi. Foydalanuvchilar va omborxonalar filialga biriktiriladi */
export default function Branches() {
  const { t } = useTranslation();
  const organizations = useReferenceList<Organization>("/api/organizations");

  return (
    <ReferenceCrud<Branch>
      resource="branches"
      endpoint="/api/branches"
      title={t("modules.branches.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white" },
        { key: "responsible", label: t("ref.responsible"), render: (row) => row.responsibleName || "—" },
        { key: "phone", label: t("ref.phone"), render: (row) => row.phone || "—", className: "whitespace-nowrap" },
        { key: "organization", label: t("branches.organization"), render: (row) => row.organization?.name || "—" },
        { key: "address", label: t("ref.address"), render: (row) => row.address || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("branches.name"), kind: "text", required: true, maxLength: 160 },
        { name: "responsibleName", label: t("ref.responsible"), kind: "text", maxLength: 160, hint: t("branches.responsible_hint") },
        { name: "phone", label: t("ref.phone"), kind: "text", maxLength: 30, placeholder: "+998 90 123 45 67", half: true },
        {
          name: "organizationId", label: t("branches.organization"), kind: "select", half: true,
          options: organizations.map((o) => ({ value: o.id, label: o.name })),
        },
        { name: "address", label: t("ref.address"), kind: "text", maxLength: 255 },
      ]}
      blank={{ name: "", responsibleName: "", phone: "", address: "", organizationId: "" }}
      toForm={(row) => ({
        name: row.name,
        responsibleName: row.responsibleName || "",
        phone: row.phone || "",
        address: row.address || "",
        organizationId: row.organizationId || "",
      })}
      searchText={(row) => [row.name, row.responsibleName, row.phone, row.address, row.organization?.name].filter(Boolean).join(" ")}
      rowName={(row) => row.name}
    />
  );
}
