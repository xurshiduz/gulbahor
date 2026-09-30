import { useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Ban, ShoppingCart, X } from "lucide-react";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { formatMoney } from "./shared";

type Status = "NEW" | "SOLD" | "USED" | "CANCELLED";

interface Certificate extends RefRow {
  code: string;
  amount: number;
  balance: number;
  validUntil: string | null;
  status: Status;
  soldAt: string | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
  note: string | null;
}

const STATUS_STYLE: Record<Status | "EXPIRED", string> = {
  NEW: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  SOLD: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  USED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  CANCELLED: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  EXPIRED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
};

/** Muddati o'tgan (lekin hali ishlatilmagan) sertifikat alohida ko'rsatiladi */
const displayStatus = (row: Certificate): Status | "EXPIRED" =>
  (row.status === "NEW" || row.status === "SOLD") && row.validUntil && row.validUntil < dayjs().format("YYYY-MM-DD")
    ? "EXPIRED"
    : row.status;

/**
 * Sovg'a sertifikatlari: yaratish (bittalab yoki bir yo'la bir nechta),
 * sotish va bekor qilish. Sotilgan sertifikatning qoldig'i keyinchalik
 * sotuvda to'lov sifatida ishlatiladi.
 */
export default function GiftCertificates() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { can, canUpdate } = usePermissions();
  const customers = useReferenceList<{ id: string; name: string; phone: string | null }>("/api/customers");
  const sum = t("currencies.sum");

  // Sotish oynasi
  const [selling, setSelling] = useState<{ row: Certificate; reload: () => void } | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [sellError, setSellError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const post = async (path: string, body?: unknown) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.error")));
  };

  const sell = async () => {
    if (!selling) return;
    try {
      setIsBusy(true);
      setSellError("");
      await post(`/api/gift-certificates/${selling.row.id}/sell`, { customerId: customerId || null });
      selling.reload();
      setSelling(null);
    } catch (err: any) {
      setSellError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const cancel = async (row: Certificate, reload: () => void) => {
    if (!window.confirm(t("certificates.cancel_confirm", { code: row.code }))) return;
    try {
      await post(`/api/gift-certificates/${row.id}/cancel`);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const statusOptions = (["NEW", "SOLD", "USED", "CANCELLED"] as const).map((status) => ({
    value: status, label: t(`certificates.status_${status}`),
  }));

  return (
    <>
      <ReferenceCrud<Certificate>
        resource="gift-certificates"
        endpoint="/api/gift-certificates"
        title={t("modules.giftCertificates.title")}
        noStatus
        columns={[
          { key: "code", label: t("certificates.code"), render: (row) => row.code, className: "font-mono text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap" },
          { key: "amount", label: t("certificates.amount"), render: (row) => `${formatMoney(row.amount)} ${sum}`, className: "whitespace-nowrap" },
          { key: "balance", label: t("certificates.balance"), render: (row) => `${formatMoney(row.balance)} ${sum}`, className: "whitespace-nowrap" },
          { key: "validUntil", label: t("certificates.valid_until"), render: (row) => (row.validUntil ? dayjs(row.validUntil).format("DD.MM.YYYY") : t("certificates.no_expiry")), className: "whitespace-nowrap" },
          {
            key: "status",
            label: t("ref.status"),
            render: (row) => {
              const status = displayStatus(row);
              return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{t(`certificates.status_${status}`)}</span>;
            },
          },
          {
            key: "sold",
            label: t("certificates.sold"),
            render: (row) =>
              row.soldAt ? (
                <span>
                  <span className="block whitespace-nowrap">{dayjs(row.soldAt).format("DD.MM.YYYY HH:mm")}</span>
                  {row.customer && <span className="block text-xs text-gray-500 dark:text-gray-400">{row.customer.name}</span>}
                </span>
              ) : "—",
          },
        ]}
        fields={({ editing }) => [
          { name: "amount", label: t("certificates.amount"), kind: "decimal", required: true, placeholder: "500000", hint: sum, half: true },
          { name: "validUntil", label: t("certificates.valid_until"), kind: "date", hint: t("certificates.valid_hint"), half: true },
          // Bir yo'la bir nechta yaratish faqat yangi sertifikatda
          ...(editing ? [] : [{ name: "count", label: t("certificates.count"), kind: "number" as const, hint: t("certificates.count_hint"), half: true }]),
          { name: "code", label: t("certificates.code"), kind: "text", maxLength: 32, hint: t("certificates.code_hint"), half: true },
          { name: "note", label: t("contractors.note"), kind: "textarea", maxLength: 500 },
        ]}
        blank={{ amount: "", validUntil: "", count: 1, code: "", note: "" }}
        toForm={(row) => ({ amount: String(row.amount), validUntil: row.validUntil || "", code: row.code, note: row.note || "" })}
        searchText={(row) => `${row.code} ${row.customer?.name || ""} ${row.note || ""}`}
        rowName={(row) => row.code}
        // Sotilgan sertifikat o'zgartirilmaydi va o'chirilmaydi
        canEdit={(row) => row.status === "NEW"}
        canRemove={(row) => row.status === "NEW" || row.status === "CANCELLED"}
        rowActions={(row, reload) => (
          <>
            {row.status === "NEW" && can("sell:gift-certificates") && (
              <button
                onClick={() => { setSelling({ row, reload }); setCustomerId(""); setSellError(""); }}
                title={t("certificates.sell")}
                aria-label={t("certificates.sell")}
                className="text-gray-400 hover:text-green-600"
              >
                <ShoppingCart className="h-4 w-4" />
              </button>
            )}
            {(row.status === "NEW" || row.status === "SOLD") && canUpdate("gift-certificates") && (
              <button onClick={() => cancel(row, reload)} title={t("certificates.cancel")} aria-label={t("certificates.cancel")} className="text-gray-400 hover:text-red-500">
                <Ban className="h-4 w-4" />
              </button>
            )}
          </>
        )}
        filter={{
          allLabel: t("certificates.all_statuses"),
          options: statusOptions,
          match: (row, value) => row.status === value,
        }}
      />

      {/* Sotish oynasi */}
      {selling && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("certificates.sell_title")}</h3>
                <p className="mt-0.5 font-mono text-sm text-gray-500 dark:text-gray-400">
                  {selling.row.code} · {formatMoney(selling.row.amount)} {sum}
                </p>
              </div>
              <button onClick={() => setSelling(null)} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("certificates.customer")} <span className="font-normal text-gray-400">({t("common.optional")})</span>
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">{t("ref.not_selected")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}{customer.phone ? ` · ${customer.phone}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t("certificates.sell_hint")}</p>

            {sellError && <p className="mt-3 text-sm font-medium text-red-500">{sellError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelling(null)}>{t("common.cancel")}</Button>
              <Button onClick={sell} disabled={isBusy}>{isBusy ? t("common.saving") : t("certificates.sell")}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
