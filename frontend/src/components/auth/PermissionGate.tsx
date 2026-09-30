import { useMemo } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { ShieldOff } from "lucide-react";
import { MODULES } from "../../config/modules";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuth } from "../../context/AuthContext";

/**
 * Sahifaga huquq bo'lmasa to'g'ri havola orqali ham kirib bo'lmaydi.
 *
 * Menyu yashirilishining o'zi yetarli emas: manzilni qo'lda yozgan odam
 * sahifani ochib olardi. Manzil -> resurs jadvali MODULES'dan olinadi
 * (ichki sahifalar, masalan /users/123, prefiks bilan topiladi);
 * ro'yxatda yo'q sahifalar hammaga ochiq (profil, kirish tarixi).
 * API o'z huquqini baribir alohida tekshiradi - bu faqat interfeys uchun.
 */

/**
 * MODULES'da yo'q, lekin huquqqa bog'liq sahifalar. `action` berilsa
 * "Ko'rish" o'rniga o'sha harakat ham yetarli.
 */
const EXTRA_ROUTES: { path: string; resource: string; action?: string }[] = [];

/** Bosh sahifa va shaxsiy sahifalar - huquqsiz ham ochiq */
const OPEN_PATHS = ["/", "/profile", "/sessions"];

function routeFor(pathname: string): { resource: string; action?: string } | null {
  if (OPEN_PATHS.includes(pathname)) return null;
  const candidates: { path: string; resource: string; action?: string }[] = [
    ...EXTRA_ROUTES,
    ...MODULES.filter((m) => m.resource && m.path !== "/").map((m) => ({ path: m.path, resource: m.resource as string, action: m.action })),
  ];
  // Eng uzun mos prefiks: /reports/sales /reports dan ustun
  let best: { path: string; resource: string; action?: string } | null = null;
  for (const c of candidates) {
    if (pathname === c.path || pathname.startsWith(c.path + "/")) {
      if (!best || c.path.length > best.path.length) best = c;
    }
  }
  return best ? { resource: best.resource, action: best.action } : null;
}

export default function PermissionGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { canView, can } = usePermissions();
  const { user } = useAuth();

  const route = useMemo(() => routeFor(pathname), [pathname]);
  // Foydalanuvchi hali yuklanmagan bo'lsa (yangilangan sahifa) - kutamiz, rad etmaymiz
  if (!user) return <>{children}</>;
  if (!route || canView(route.resource) || (route.action && can(`${route.action}:${route.resource}`))) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">
          <ShieldOff className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("access.denied_title")}</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t("access.denied_text")}</p>
        <Link to="/" className="mt-6 inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          {t("access.go_home")}
        </Link>
      </div>
    </div>
  );
}
