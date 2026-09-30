import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Plus, Search } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../../components/common/Pagination";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { STATUS_STYLE, formatMoney, formatQuantity, type InboundStatus } from "../Inbounds/types";

interface OutboundRow {
  id: string;
  documentNumber: string;
  status: InboundStatus;
  documentDate: string;
  customer: { id: string; name: string; phone?: string | null } | null;
  warehouse: { id: string; name: string } | null;
  description: string | null;
  createdBy: { name: string } | null;
  itemsCount: number;
  totalQuantity: number;
  totalAmount: number;
}

const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";
const td = "px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300";

/** Chiqim hujjatlari - barcha sotuvlar ro'yxati */
export default function OutboundsList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const { canCreate } = usePermissions();

  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const res = await fetch("/api/outbound-documents", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return logout();
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.load_error")));
      setRows(await res.json());
    } catch (err: any) {
      setLoadError(err.message || t("common.load_error"));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const query = normalizeSearch(search);
  const filtered = useMemo(
    () => rows.filter((row) =>
      (!statusFilter || row.status === statusFilter) &&
      (!query || normalizeSearch([row.documentNumber, row.customer?.name, row.customer?.phone, row.description, row.warehouse?.name].filter(Boolean).join(" ")).includes(query)),
    ),
    [rows, query, statusFilter],
  );
  const totalAmount = useMemo(() => filtered.reduce((sum, row) => sum + row.totalAmount, 0), [filtered]);

  useEffect(() => { setPage(1); }, [query, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <PageMeta title={`${t("modules.outbounds.title")} | Gulbahor`} description={t("modules.outbounds.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">{t("modules.outbounds.title")}</h2>
            {filtered.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("inbounds.total")}: <b className="text-gray-800 dark:text-white">{formatMoney(totalAmount)}</b> {t("currencies.sum")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">{t("inbounds.all_statuses")}</option>
              <option value="DRAFT">{t("inbounds.status_DRAFT")}</option>
              <option value="APPROVED">{t("inbounds.status_APPROVED")}</option>
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder={t("outbounds.list_search")} value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-44 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-64"
              />
            </div>
            {canCreate("outbound-documents") && (
              <Button onClick={() => navigate("/outbounds/create")} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                {t("inbounds.create")}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={th}>{t("inbounds.number")}</th>
                <th className={th}>{t("inbounds.date")}</th>
                <th className={th}>{t("inbounds.customer")}</th>
                <th className={th}>{t("inbounds.warehouse")}</th>
                <th className={`${th} text-right`}>{t("inbounds.positions")}</th>
                <th className={`${th} text-right`}>{t("inbounds.quantity")}</th>
                <th className={`${th} text-right`}>{t("inbounds.amount")}</th>
                <th className={th}>{t("ref.status")}</th>
                <th className={th}>{t("inbounds.description")}</th>
                <th className={th}>{t("inbounds.created_by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
              ) : loadError ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-red-500">{loadError}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-500">{t("ref.empty")}</td></tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/outbounds/${row.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/outbounds/${row.id}`); }}
                    tabIndex={0}
                    className="cursor-pointer hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none dark:hover:bg-blue-900/10 transition-colors"
                  >
                    <td className={`${td} whitespace-nowrap font-mono text-xs font-semibold text-gray-900 dark:text-white`}>{row.documentNumber}</td>
                    <td className={`${td} whitespace-nowrap`}>{dayjs(row.documentDate).format("DD.MM.YYYY")}</td>
                    <td className={td}>{row.customer?.name || "—"}</td>
                    <td className={td}>{row.warehouse?.name || "—"}</td>
                    <td className={`${td} text-right`}>{row.itemsCount}</td>
                    <td className={`${td} text-right`}>{formatQuantity(row.totalQuantity)}</td>
                    <td className={`${td} text-right whitespace-nowrap font-medium text-gray-900 dark:text-white`}>
                      {formatMoney(row.totalAmount)} <span className="text-xs font-normal text-gray-400">{t("currencies.sum")}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[row.status]}`}>{t(`inbounds.status_${row.status}`)}</span>
                    </td>
                    <td className={`${td} max-w-xs truncate text-gray-500 dark:text-gray-400`} title={row.description || ""}>{row.description || "—"}</td>
                    <td className={`${td} whitespace-nowrap text-gray-500 dark:text-gray-400`}>{row.createdBy?.name || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={filtered.length}
          overall={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </div>
    </>
  );
}
