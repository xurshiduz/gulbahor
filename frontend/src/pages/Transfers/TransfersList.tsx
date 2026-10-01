import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Plus, Search } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../../components/common/Pagination";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { STATUS_STYLE, fmtQty, type TransferStatus } from "./shared";

interface Row {
  id: string; number: string; status: TransferStatus; direction: "IN" | "OUT" | null;
  fromBranch: { name: string } | null; fromWarehouse: { name: string } | null;
  toBranch: { name: string } | null; toWarehouse: { name: string } | null;
  itemsCount: number; totalQuantity: number; receivedQuantity: number | null;
  createdAt: string; sentAt: string | null; receivedAt: string | null; createdBy: { name: string } | null; description: string | null;
}
type Tab = "all" | "incoming" | "outgoing";

const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";
const td = "px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300";

/** Ko'chirishlar: kiruvchi (qabul kutayotgan), chiquvchi va hammasi */
export default function TransfersList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const { canCreate } = usePermissions();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/transfers", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return logout();
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
      setRows(data);
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { if (token) load(); }, [token, load]);

  const query = normalizeSearch(search);
  const filtered = useMemo(() => rows.filter((row) =>
    (tab === "all" || (tab === "incoming" ? row.direction === "IN" || (row.direction === null && row.status === "SENT") : row.direction === "OUT" || row.direction === null)) &&
    (!statusFilter || row.status === statusFilter) &&
    (!query || normalizeSearch([row.number, row.fromBranch?.name, row.fromWarehouse?.name, row.toBranch?.name, row.toWarehouse?.name, row.description].filter(Boolean).join(" ")).includes(query))), [rows, tab, statusFilter, query]);
  useEffect(() => { setPage(1); }, [tab, statusFilter, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const awaiting = rows.filter((row) => row.status === "SENT" && row.direction !== "OUT").length;

  return (
    <>
      <PageMeta title={`${t("modules.transfers.title")} | Gulbahor`} description={t("modules.transfers.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">{t("modules.transfers.title")}</h2>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700" role="tablist">
              {(["all", "incoming", "outgoing"] as Tab[]).map((key) => (
                <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${tab === key ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}>
                  {key === "incoming" && <ArrowDownLeft className="h-3.5 w-3.5" />}{key === "outgoing" && <ArrowUpRight className="h-3.5 w-3.5" />}
                  {t(`transfers.tab_${key}`)}
                  {key === "incoming" && awaiting > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{awaiting}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <option value="">{t("inbounds.all_statuses")}</option>
              {(["DRAFT", "SENT", "RECEIVED", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{t(`transfers.status_${s}`)}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-40 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-56" />
            </div>
            {canCreate("transfers") && (
              <Button onClick={() => navigate("/transfers/create")} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" /> {t("transfers.new")}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={th}>{t("inbounds.number")}</th>
                <th className={th}>{t("transfers.route")}</th>
                <th className={`${th} text-right`}>{t("inbounds.positions")}</th>
                <th className={`${th} text-right`}>{t("transfers.sent_qty")}</th>
                <th className={`${th} text-right`}>{t("transfers.received_qty")}</th>
                <th className={th}>{t("ref.status")}</th>
                <th className={th}>{t("transfers.dates")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
                : loadError ? <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-red-500">{loadError}</td></tr>
                : pageRows.length === 0 ? <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">{t("ref.empty")}</td></tr>
                : pageRows.map((row) => {
                  const short = row.receivedQuantity !== null && row.receivedQuantity < row.totalQuantity;
                  return (
                    <tr key={row.id} onClick={() => navigate(`/transfers/${row.id}`)} className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10">
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="font-mono text-xs font-semibold text-gray-900 dark:text-white">{row.number}</span>
                        {row.direction && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${row.direction === "IN" ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10" : "bg-gray-100 text-gray-600 dark:bg-gray-800"}`}>{t(`transfers.dir_${row.direction}`)}</span>}
                      </td>
                      <td className={td}>
                        <span className="flex items-center gap-2">
                          <span><span className="block font-medium text-gray-900 dark:text-white">{row.fromWarehouse?.name}</span><span className="block text-xs text-gray-400">{row.fromBranch?.name}</span></span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                          <span><span className="block font-medium text-gray-900 dark:text-white">{row.toWarehouse?.name}</span><span className="block text-xs text-gray-400">{row.toBranch?.name}</span></span>
                        </span>
                      </td>
                      <td className={`${td} text-right`}>{row.itemsCount}</td>
                      <td className={`${td} text-right tabular-nums`}>{fmtQty(row.totalQuantity)}</td>
                      <td className={`${td} text-right tabular-nums ${short ? "font-semibold text-red-600 dark:text-red-400" : ""}`}>{row.receivedQuantity !== null ? fmtQty(row.receivedQuantity) : "—"}</td>
                      <td className={`${td} whitespace-nowrap`}><span className={`rounded-md px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[row.status]}`}>{t(`transfers.status_${row.status}`)}</span></td>
                      <td className={`${td} whitespace-nowrap text-xs text-gray-500`}>
                        {row.sentAt ? `${t("transfers.sent_at")}: ${dayjs(row.sentAt).format("DD.MM HH:mm")}` : dayjs(row.createdAt).format("DD.MM.YYYY")}
                        {row.receivedAt && <span className="block">{t("transfers.received_at")}: {dayjs(row.receivedAt).format("DD.MM HH:mm")}</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <Pagination page={currentPage} pageSize={pageSize} total={filtered.length} overall={rows.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </div>
    </>
  );
}
