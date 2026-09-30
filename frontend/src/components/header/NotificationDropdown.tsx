import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Bell, LogIn, MonitorSmartphone, ShieldAlert, X } from "lucide-react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { useAuth } from "../../context/AuthContext";
import { describeDevice } from "../../utils/device";

/**
 * Bildirishnomalar: hisobga kirishlar.
 *
 * Foydalanuvchi o'z hisobiga boshqa qurilmadan yoki admin uning nomidan
 * kirganini shu yerda ko'radi - qurilma, IP va vaqt bilan. Joriy seans
 * ro'yxatga kirmaydi. Ro'yxat har daqiqada yangilanadi; ko'rilmaganlar
 * soni belgichada, "ko'rildi" chegarasi brauzerda saqlanadi.
 */

interface LoginNotification {
  id: string;
  loginAt: string;
  logoutAt: string | null;
  ipAddress: string | null;
  device: string;
  impersonatedBy: string | null;
  isCurrent: boolean;
}

const SEEN_KEY = "loginNotificationsSeenAt";
const REFRESH_MS = 60_000;

const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) || "";
  } catch {
    return "";
  }
};

export default function NotificationDropdown() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<LoginNotification[]>([]);
  const [seenAt, setSeenAt] = useState(readSeen);

  /*
   * Ro'yxatning yuqori cheti.
   *
   * Katta ekranda ro'yxat tugmaga yopishib turadi. Tor ekranda esa
   * sarlavha ikonkalari chap tarafda qoladi (justify-end faqat lg dan
   * boshlanadi), shuning uchun tugmaga bog'langan ro'yxat ekrandan
   * chiqib ketardi. U yerda ro'yxat ekranning o'ziga bog'lanadi -
   * chap va o'ng cheti belgilangan, yuqorisi esa tugmadan hisoblanadi.
   */
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelTop, setPanelTop] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/auth/notifications", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // Tarmoq uzilsa eski ro'yxat qoladi
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // Joriy seansdan boshqa, hali ko'rilmagan kirishlar
  const unseen = items.filter((n) => !n.isCurrent && (!seenAt || n.loginAt > seenAt));
  const foreign = items.filter((n) => !n.isCurrent);

  const closeDropdown = useCallback(() => setIsOpen(false), []);

  const handleClick = () => {
    if (!isOpen) {
      if (buttonRef.current) setPanelTop(buttonRef.current.getBoundingClientRect().bottom + 8);
      // Ochilganda hammasi ko'rilgan hisoblanadi
      const latest = items.reduce((max, n) => (n.loginAt > max ? n.loginAt : max), "");
      if (latest) {
        setSeenAt(latest);
        try {
          localStorage.setItem(SEEN_KEY, latest);
        } catch {
          // saqlanmasa ham ishlayveradi
        }
      }
      load();
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" style={{ ["--notif-top" as string]: `${panelTop}px` }}>
      <button
        ref={buttonRef}
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-8 w-8 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleClick}
        title={t("header.notifications")}
        aria-label={t("header.notifications")}
      >
        {unseen.length > 0 && (
          <span className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
            {unseen.length}
            <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-60 animate-ping" />
          </span>
        )}
        <Bell className="h-4 w-4" />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="!fixed !left-3 !right-3 !top-[var(--notif-top)] !mt-0 flex h-[480px] max-h-[calc(100vh-var(--notif-top)-1rem)] w-auto flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark lg:!absolute lg:!left-auto lg:!right-0 lg:!top-auto lg:!mt-[17px] lg:max-h-none lg:w-[380px]"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h5 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t("notifications.title")}</h5>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("notifications.subtitle")}</p>
          </div>
          <button onClick={closeDropdown} aria-label={t("common.close")} className="text-gray-500 transition dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="flex flex-1 flex-col h-auto overflow-y-auto custom-scrollbar">
          {foreign.length === 0 ? (
            <li className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("notifications.empty")}
            </li>
          ) : (
            foreign.map((n) => {
              const isNew = !seenAt || n.loginAt > seenAt;
              const active = !n.logoutAt;
              return (
                <li
                  key={n.id}
                  className={`flex gap-3 rounded-lg border-b border-gray-100 px-3 py-3 dark:border-gray-800 ${isNew ? "bg-orange-50/60 dark:bg-orange-500/5" : ""}`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      n.impersonatedBy
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    }`}
                  >
                    {n.impersonatedBy ? <ShieldAlert className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  </span>
                  <span className="block min-w-0 flex-1">
                    <span className="block text-sm text-gray-800 dark:text-white/90">
                      {n.impersonatedBy
                        ? t("notifications.impersonated", { name: n.impersonatedBy })
                        : t("notifications.signed_in")}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <MonitorSmartphone className="h-3 w-3" /> {describeDevice(n.device, t("sessions.unknown_device"))}
                      </span>
                      {n.ipAddress && <span className="font-mono">IP {n.ipAddress}</span>}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                      {dayjs(n.loginAt).format("DD.MM.YYYY HH:mm")}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>
                        {active ? t("sessions.status_active") : t("sessions.status_closed")}
                      </span>
                    </span>
                  </span>
                </li>
              );
            })
          )}
        </ul>

        <Link
          to="/sessions"
          onClick={closeDropdown}
          className="mt-3 block rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
        >
          {t("notifications.all_sessions")}
        </Link>
      </Dropdown>
    </div>
  );
}
