import { useCallback, useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { useAuth } from "../../context/AuthContext";
import { Monitor, Smartphone, Globe, CheckCircle2, Search, LogOut, ShieldAlert } from "lucide-react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { describeDevice, deviceKind, splitImpersonation } from "../../utils/device";
import { errorMessage, readJson } from "../../utils/api";

dayjs.extend(duration);
dayjs.extend(relativeTime);

interface Session {
  id: string;
  device: string;
  ipAddress: string;
  loginAt: string;
  logoutAt: string | null;
  /** Shu brauzerdagi seans */
  isCurrent?: boolean;
}

function DeviceIcon({ userAgent }: { userAgent: string }) {
  const kind = deviceKind(userAgent);
  if (kind === "mobile") return <Smartphone className="w-4 h-4 text-gray-400" />;
  if (kind === "desktop") return <Monitor className="w-4 h-4 text-gray-400" />;
  return <Globe className="w-4 h-4 text-gray-400" />;
}

/**
 * Kirish tarixi: foydalanuvchining oxirgi seanslari - qurilma, IP, kirgan va
 * chiqqan vaqti bilan. Boshqa qurilmadagi ochiq seansni shu yerdan yopish
 * mumkin (o'sha qurilma tizimdan chiqadi).
 */
export default function Sessions() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchSessions();
  }, [token, fetchSessions]);

  const terminate = async (session: Session) => {
    if (!window.confirm(t("sessions.terminate_confirm"))) return;
    try {
      const res = await fetch(`/api/auth/sessions/${session.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.error")));
      await fetchSessions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const deviceLabel = (session: Session) =>
    describeDevice(splitImpersonation(session.device).device, t("sessions.unknown_device"));

  const formatDuration = (login: string, logout: string | null) => {
    if (!logout) return null;
    return dayjs.duration(dayjs(logout).diff(dayjs(login))).humanize();
  };

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return sessions;
    const lower = searchTerm.trim().toLowerCase();
    return sessions.filter(
      (s) =>
        (s.ipAddress || '').toLowerCase().includes(lower) ||
        describeDevice(splitImpersonation(s.device).device, '').toLowerCase().includes(lower) ||
        dayjs(s.loginAt).format('DD.MM.YYYY').includes(lower),
    );
  }, [sessions, searchTerm]);

  const currentItems = filteredSessions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const statusBadge = (session: Session) => {
    if (session.isCurrent) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="w-3 h-3" />
          {t("sessions.status_current")}
        </span>
      );
    }
    if (!session.logoutAt) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {t("sessions.status_active")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        {t("sessions.status_closed")}
      </span>
    );
  };

  const impersonationNote = (session: Session) => {
    const { impersonatedBy } = splitImpersonation(session.device);
    if (!impersonatedBy) return null;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        <ShieldAlert className="h-3 w-3" />
        {t("sessions.impersonated_by", { name: impersonatedBy })}
      </span>
    );
  };

  const terminateButton = (session: Session) =>
    !session.isCurrent && !session.logoutAt ? (
      <button
        onClick={() => terminate(session)}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        <LogOut className="h-3 w-3" />
        {t("sessions.terminate")}
      </button>
    ) : null;

  return (
    <>
      <PageMeta title={`${t("sessions.title")} | Gulbahor`} description={t("sessions.title")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        {/* Sarlavha */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 dark:text-white/90">
            <h2 className="text-sm font-semibold uppercase tracking-wide">{t("sessions.title")}</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t("sessions.search_placeholder")}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full sm:w-72 pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-800 dark:text-white"
            />
          </div>
        </div>

        {/* Telefonda kartochkalar */}
        <div className="md:hidden flex-1 min-h-0 overflow-auto p-3 space-y-2">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-gray-500">{t("common.loading")}</p>
          ) : currentItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">{t("sessions.empty")}</p>
          ) : (
            currentItems.map((session) => (
              <div key={session.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center gap-2">
                  <DeviceIcon userAgent={session.device} />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{deviceLabel(session)}</span>
                  <span className="ml-auto">{statusBadge(session)}</span>
                </div>
                {impersonationNote(session)}
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <div className="col-span-2 font-mono"><span className="text-gray-400 font-sans">IP:</span> {session.ipAddress || '-'}</div>
                  <div><span className="text-gray-400">{t("sessions.login_at")}:</span> {dayjs(session.loginAt).format('DD.MM.YYYY HH:mm')}</div>
                  <div>
                    <span className="text-gray-400">{t("sessions.logout_at")}:</span>{' '}
                    {session.logoutAt ? dayjs(session.logoutAt).format('DD.MM.YYYY HH:mm') : '—'}
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400">{t("sessions.duration")}:</span>{' '}
                    {formatDuration(session.loginAt, session.logoutAt) || '—'}
                  </div>
                </div>
                <div className="mt-2">{terminateButton(session)}</div>
              </div>
            ))
          )}
        </div>

        {/* Jadval */}
        <div className="hidden md:block flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-900">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                {["#", t("sessions.device"), t("sessions.ip"), t("sessions.login_at"), t("sessions.logout_at"), t("sessions.duration"), t("sessions.status"), ""].map((label, i) => (
                  <th key={i} className={`px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider ${i === 0 ? "w-16" : ""}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
              ) : currentItems.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">{t("sessions.empty")}</td></tr>
              ) : (
                currentItems.map((session, idx) => (
                  <tr key={session.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <DeviceIcon userAgent={session.device} />
                        <span className="text-sm font-medium text-gray-900 dark:text-white/90">{deviceLabel(session)}</span>
                      </div>
                      {impersonationNote(session)}
                    </td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-mono">
                      {session.ipAddress || '-'}
                    </td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {dayjs(session.loginAt).format('DD.MM.YYYY HH:mm')}
                    </td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {session.logoutAt ? dayjs(session.logoutAt).format('DD.MM.YYYY HH:mm') : '—'}
                    </td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDuration(session.loginAt, session.logoutAt) || '—'}
                    </td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap">{statusBadge(session)}</td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap text-right">{terminateButton(session)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          pageSize={itemsPerPage}
          total={filteredSessions.length}
          overall={sessions.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
        />
      </div>
    </>
  );
}
