import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";
import { normalizeSearch } from "../../config/modules";

interface CashRegisterRow extends RefRow {
  name: string;
  branchId: string;
  branch: { id: string; name: string } | null;
  warehouseId: string | null;
  warehouse: { id: string; name: string } | null;
  users: { id: string; name: string; username: string }[];
  description: string | null;
}

interface Named { id: string; name: string; isActive?: boolean }
interface WarehouseRef extends Named { branchId: string }
interface UserRef { id: string; name: string; username: string; isActive?: boolean }

/** Kassirlarni belgilash: qidiruv + belgilash ro'yxati */
function CashierPicker({ users, value, onChange }: { users: UserRef[]; value: string[]; onChange: (next: string[]) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const selected = new Set(value || []);
  const q = normalizeSearch(query);
  const shown = users.filter((user) => (user.isActive !== false || selected.has(user.id)) && (!q || normalizeSearch(`${user.name} ${user.username}`).includes(q)));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="rounded-lg border border-gray-300 dark:border-gray-700">
      <div className="relative border-b border-gray-200 dark:border-gray-700">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("cash.cashier_search")}
          className="h-9 w-full rounded-t-lg bg-transparent pl-8 pr-2 text-sm text-gray-800 focus:outline-none dark:text-white"
        />
      </div>
      <div className="max-h-44 overflow-y-auto p-1">
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-gray-500">{t("common.nothing_found")}</p>
        ) : shown.map((user) => (
          <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5">
            <input type="checkbox" checked={selected.has(user.id)} onChange={() => toggle(user.id)} className="h-4 w-4 rounded border-gray-300 text-brand-500" />
            <span className="text-sm text-gray-800 dark:text-gray-200">{user.name}</span>
            <span className="text-xs text-gray-400">@{user.username}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Kassalar. Bitta filialda bir nechta kassa bo'ladi; har biriga kassirlar
 * biriktiriladi va sotuvda tovar chiqadigan omborxona belgilanadi.
 */
export default function CashRegisters() {
  const { t } = useTranslation();
  const branches = useReferenceList<Named>("/api/branches");
  const warehouses = useReferenceList<WarehouseRef>("/api/warehouses");
  const users = useReferenceList<UserRef>("/api/users");

  return (
    <ReferenceCrud<CashRegisterRow>
      resource="cash-registers"
      endpoint="/api/cash-registers"
      title={t("modules.cashRegisters.title")}
      wide
      columns={[
        { key: "name", label: t("ref.name"), render: (row) => row.name, className: "font-medium text-gray-900 dark:text-white" },
        { key: "branch", label: t("stock.branch"), render: (row) => row.branch?.name || "—" },
        { key: "warehouse", label: t("cash.warehouse"), render: (row) => row.warehouse?.name || <span className="text-amber-600 dark:text-amber-400">{t("cash.no_warehouse")}</span> },
        {
          key: "users",
          label: t("cash.cashiers"),
          render: (row) => row.users.length
            ? <span className="text-sm">{row.users.map((user) => user.name).join(", ")}</span>
            : <span className="text-xs text-gray-400">{t("cash.open_to_all")}</span>,
        },
      ]}
      fields={({ form }) => [
        { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 120, placeholder: "1-kassa", half: true },
        {
          name: "branchId", label: t("stock.branch"), kind: "select", required: true, half: true,
          options: branches.filter((b) => b.isActive !== false || b.id === form.branchId).map((b) => ({ value: b.id, label: b.name })),
        },
        {
          name: "warehouseId", label: t("cash.warehouse"), kind: "select", hint: t("cash.warehouse_hint"),
          options: warehouses
            .filter((w) => w.branchId === form.branchId && (w.isActive !== false || w.id === form.warehouseId))
            .map((w) => ({ value: w.id, label: w.name })),
        },
        {
          name: "userIds", label: t("cash.cashiers"), kind: "custom", hint: t("cash.cashiers_hint"),
          render: (value, onChange) => <CashierPicker users={users} value={value || []} onChange={onChange} />,
          toPayload: (value) => value || [],
        },
        { name: "description", label: t("ref.description"), kind: "textarea", maxLength: 500 },
      ]}
      blank={{ name: "", branchId: "", warehouseId: "", userIds: [], description: "" }}
      toForm={(row) => ({
        name: row.name, branchId: row.branchId, warehouseId: row.warehouseId || "",
        userIds: row.users.map((user) => user.id), description: row.description || "",
      })}
      searchText={(row) => `${row.name} ${row.branch?.name || ""} ${row.warehouse?.name || ""} ${row.users.map((user) => user.name).join(" ")}`}
      rowName={(row) => row.name}
      filter={{
        allLabel: t("stock.all_branches"),
        options: branches.map((b) => ({ value: b.id, label: b.name })),
        match: (row, value) => row.branchId === value,
      }}
    />
  );
}
