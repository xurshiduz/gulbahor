import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { History, Lock, UserCircle } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import Modules from "./Modules";

/**
 * Bosh sahifa. Hozircha salomlashuv, shaxsiy sahifalarga tezkor havolalar
 * va foydalanuvchiga ochiq modullar. Hisobotlar/ko'rsatkichlar keyingi
 * bosqichlarda shu yerga qo'shiladi.
 */
export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const shortcuts = [
    { to: "/profile", icon: <UserCircle className="h-5 w-5" />, title: t("home.profile_title"), desc: t("home.profile_desc") },
    {
      to: "/profile",
      icon: <Lock className="h-5 w-5" />,
      title: t("home.pin_title"),
      desc: user?.lockPinEnabled
        ? t("home.pin_on", { minutes: user.autoLockMinutes })
        : t("home.pin_off"),
    },
    { to: "/sessions", icon: <History className="h-5 w-5" />, title: t("home.sessions_title"), desc: t("home.sessions_desc") },
  ];

  return (
    <>
      <PageMeta title={`${t("sidebar.dashboard")} | Gulbahor`} description={t("home.meta_desc")} />
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {t("home.greeting", { name: user?.name || user?.username || "" })}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("home.subtitle")}</p>
            {user?.roles?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {user.roles.map((r: any) => (
                  <span key={r.id || r.name} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-400">
                    {r.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {shortcuts.map((s) => (
              <Link
                key={s.title}
                to={s.to}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-800"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10">
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-800 dark:text-white">{s.title}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{s.desc}</span>
                </span>
              </Link>
            ))}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              {t("home.modules")}
            </h2>
            <Modules />
          </div>
        </div>
      </div>
    </>
  );
}
