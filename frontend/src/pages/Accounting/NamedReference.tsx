import { useTranslation } from "react-i18next";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";

interface Named extends RefRow {
  name: string;
  description: string | null;
}

/** Harajat turi to'lovni nimaga bog'laydi */
const EXPENSE_TARGETS = ["NONE", "INBOUND_DOCUMENT", "SUPPLIER", "CUSTOMER"] as const;
type ExpenseTarget = (typeof EXPENSE_TARGETS)[number];

interface ExpenseTypeRow extends Named {
  target: ExpenseTarget;
}

export function PaymentTypes() {
  const { t } = useTranslation();

  return (
    <ReferenceCrud<Named>
      resource="payment-types"
      endpoint="/api/payment-types"
      title={t("modules.paymentTypes.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white" },
        { key: "description", label: t("ref.description"), render: (row) => row.description || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 120, placeholder: "Naqd pul" },
        { name: "description", label: t("ref.description"), kind: "textarea", maxLength: 500 },
      ]}
      blank={{ name: "", description: "" }}
      toForm={(row) => ({ name: row.name, description: row.description || "" })}
      searchText={(row) => `${row.name} ${row.description || ""}`}
      rowName={(row) => row.name}
    />
  );
}

/**
 * Harajat turlari. "Bog'lanish" - shu turdagi to'lov nimaga yoziladi:
 * kirim hujjatiga, yetkazib beruvchiga, mijozga yoki hech nimaga (umumiy).
 * To'lov kiritilganda shunga qarab hujjat yoki kontragent so'raladi.
 */
export function ExpenseTypes() {
  const { t } = useTranslation();
  const targets = EXPENSE_TARGETS.map((value) => ({ value, label: t(`expenses.target_${value}`) }));

  return (
    <ReferenceCrud<ExpenseTypeRow>
      resource="expense-types"
      endpoint="/api/expense-types"
      title={t("modules.expenseTypes.title")}
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white" },
        {
          key: "target",
          label: t("expenses.target"),
          className: "whitespace-nowrap",
          render: (row) => (
            <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${
              !row.target || row.target === "NONE"
                ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
            }`}>
              {t(`expenses.target_${row.target || "NONE"}`)}
            </span>
          ),
        },
        { key: "description", label: t("ref.description"), render: (row) => row.description || "—", className: "text-gray-500 dark:text-gray-400" },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 120, placeholder: "Ijara" },
        { name: "target", label: t("expenses.target"), kind: "select", required: true, options: targets, hint: t("expenses.target_hint") },
        { name: "description", label: t("ref.description"), kind: "textarea", maxLength: 500 },
      ]}
      blank={{ name: "", target: "NONE", description: "" }}
      toForm={(row) => ({ name: row.name, target: row.target || "NONE", description: row.description || "" })}
      searchText={(row) => `${row.name} ${row.description || ""} ${t(`expenses.target_${row.target || "NONE"}`)}`}
      rowName={(row) => row.name}
      filter={{
        allLabel: t("expenses.all_targets"),
        options: targets,
        match: (row, value) => (row.target || "NONE") === value,
      }}
    />
  );
}
