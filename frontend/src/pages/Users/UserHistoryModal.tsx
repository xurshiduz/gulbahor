import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { MonitorSmartphone, ShieldAlert, X } from "lucide-react";
import { describeDevice, splitImpersonation } from "../../utils/device";

interface Session {
  id: string;
  device: string;
  ipAddress: string | null;
  loginAt: string;
  logoutAt: string | null;
}

/**
 * Xodimning kirish tarixi (Foydalanuvchilar -> "Tarix"): oxirgi 50 ta seans -
 * qachon, qaysi qurilma va IP dan kirgan, admin uning nomidan kirganmi.
 */
export default function UserHistoryModal({ user, token, onClose }: {
  user: { id: string; name: string; username: string };
  token: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/auth/sessions/user/${user.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setError(t("common.load_error")))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("sessions.title")}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{user.name} · {user.username}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3 custom-scrollbar">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("common.loading")}</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-500">{error}</p>
          ) : sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("users.history_empty")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {sessions.map((s) => {
                const { impersonatedBy, device } = splitImpersonation(s.device);
                const active = !s.logoutAt;
                return (
                  <li key={s.id} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      impersonatedBy
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {impersonatedBy ? <ShieldAlert className="h-4 w-4" /> : <MonitorSmartphone className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm text-gray-800 dark:text-white/90">
                        <span className="font-medium">{describeDevice(device, t("sessions.unknown_device"))}</span>
                        {s.ipAddress && <span className="font-mono text-xs text-gray-500">IP {s.ipAddress}</span>}
                      </div>
                      {impersonatedBy && (
                        <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {t("sessions.impersonated_by", { name: impersonatedBy })}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {dayjs(s.loginAt).format("DD.MM.YYYY HH:mm")}
                        {" — "}
                        {s.logoutAt ? dayjs(s.logoutAt).format("DD.MM.YYYY HH:mm") : "…"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      active
                        ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                    }`}>
                      {active ? t("sessions.status_active") : t("sessions.status_closed")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
