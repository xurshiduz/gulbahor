import { useTranslation } from "react-i18next";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";

interface Named extends RefRow {
  name: string;
  description: string | null;
}

/** Nomi va izohi bor oddiy ma'lumotnoma - to'lov turlari va harajat turlari bir xil ko'rinishda */
function NamedReference({ resource, title, placeholder }: { resource: string; title: string; placeholder: string }) {
  const { t } = useTranslation();

  return (
    <ReferenceCrud<Named>
      resource={resource}
      endpoint={`/api/${resource}`}
      title={title}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white" },
        { key: "description", label: t("ref.description"), render: (row) => row.description || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 120, placeholder },
        { name: "description", label: t("ref.description"), kind: "textarea", maxLength: 500 },
      ]}
      blank={{ name: "", description: "" }}
      toForm={(row) => ({ name: row.name, description: row.description || "" })}
      searchText={(row) => `${row.name} ${row.description || ""}`}
      rowName={(row) => row.name}
    />
  );
}

export function PaymentTypes() {
  const { t } = useTranslation();
  return <NamedReference resource="payment-types" title={t("modules.paymentTypes.title")} placeholder="Naqd pul" />;
}

export function ExpenseTypes() {
  const { t } = useTranslation();
  return <NamedReference resource="expense-types" title={t("modules.expenseTypes.title")} placeholder="Ijara" />;
}
