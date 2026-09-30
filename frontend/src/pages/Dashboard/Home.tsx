import { useSearchParams } from "react-router";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { BarChart3, Construction, History, LayoutGrid, Lock, UserCircle, Users } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import Modules from "./Modules";
import ExecutiveReport from "./ExecutiveReport";

type Tab = "executive" | "staff" | "modules";

/**
 * Bosh sahifa - uch bo'lim:
 *  - Rahbar hisoboti: butun kompaniya savdosi, foydasi, harajatlari (huquq bilan)
 *  - Xodim hisoboti: to'ldirilmoqda
 *  - Modullar: ochiq bo'limlar va shaxsiy sahifalarga havolalar
 */
export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const canExecutive = can("read:executive-report");

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    ...(canExecutive ? [{ key: "executive" as Tab, label: t("home.tab_executive"), icon: <BarChart3 className="h-4 w-4" /> }] : []),
    { key: "staff", label: t("home.tab_staff"), icon: <Users className="h-4 w-4" /> },
    { key: "modules", label: t("home.tab_modules"), icon: <LayoutGrid className="h-4 w-4" /> },
  ];
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = tabs.some((item) => item.key === requested) ? (requested as Tab) : canExecutive ? "executive" : "modules";

  const shortcuts = [
    { to: "/profile", icon: <UserCircle className="h-5 w-5" />, title: t("home.profile_title"), desc: t("home.profile_desc") },
    {
      to: "/profile",
      icon: <Lock className="h-5 w-5" />,
      title: t("home.pin_title"),
      desc: user?.lockPinEnabled ? t("home.pin_on", { minutes: user.autoLockMinutes }) : t("home.pin_off"),
    },
    { to: "/sessions", icon: <History className="h-5 w-5" />, title: t("home.sessions_title"), desc: t("home.sessions_desc") },
  ];

  return (
    <>
      <PageMeta title={`${t("sidebar.dashboard")} | Gulbahor`} description={t("home.meta_desc")} />
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        {/* Salomlashuv va bo'limlar */}
        <div className="border-b border-gray-200 bg-white px-4 pt-4 dark:border-gray-800 dark:bg-gray-900 md:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t("home.greeting", { name: user?.name || user?.username || "" })}</h1>
            {user?.roles?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {user.roles.map((r: any) => (
                  <span key={r.id || r.name} className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-400">{r.name}</span>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-1" role="tablist">
            {tabs.map((item) => (
              <button
                key={item.key} role="tab" aria-selected={tab === item.key}
                onClick={() => setParams(item.key === "executive" || (!canExecutive && item.key === "modules") ? {} : { tab: item.key }, { replace: true })}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === item.key ? "border-brand-500 text-brand-600 dark:text-brand-400" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-6">
          {tab === "executive" && <ExecutiveReport />}

          {tab === "staff" && (
            <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-800">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-500/10"><Construction className="h-7 w-7" /></span>
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{t("home.staff_soon")}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("home.staff_soon_desc")}</p>
            </div>
          )}

          {tab === "modules" && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {shortcuts.map((s) => (
                  <Link
                    key={s.title} to={s.to}
                    className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-800"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10">{s.icon}</span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{s.title}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{s.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
              <Modules />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
