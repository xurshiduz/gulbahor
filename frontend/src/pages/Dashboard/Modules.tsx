import { useNavigate } from "react-router";
import { MODULES } from "../../config/modules";
import { usePermissions } from "../../hooks/usePermissions";
import { useTranslation } from "react-i18next";

/** Bosh sahifadagi "Modullar" bo'limi - foydalanuvchiga ochiq sahifalar kartochka ko'rinishida */
export default function Modules() {
  const navigate = useNavigate();
  const { canView } = usePermissions();
  const { t } = useTranslation();

  // Bosh sahifaning o'zi bu ro'yxatda kerak emas
  const available = MODULES.filter((m) => m.path !== "/" && (!m.resource || canView(m.resource, m.action)));

  if (!available.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400 dark:border-gray-700">
        {t("modules.noAccess")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {available.map((m) => (
        <button
          key={m.path}
          onClick={() => navigate(m.path)}
          className="flex items-center gap-4 text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 transition-all hover:shadow-md hover:border-brand-300 dark:hover:border-brand-800"
        >
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 text-white shadow-sm ${m.color}`}>
            {m.icon}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wide truncate">
              {t(`modules.${m.key}.title`)}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t(`modules.${m.key}.desc`)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
