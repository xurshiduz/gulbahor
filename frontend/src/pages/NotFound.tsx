import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import PageMeta from "../components/common/PageMeta";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <PageMeta title={`404 | Gulbahor`} description={t("not_found.title")} />
      <h1 className="text-6xl font-bold text-brand-500 mb-4">404</h1>
      <p className="text-xl mb-8">{t("not_found.title")}</p>
      <Link
        to="/"
        className="px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
      >
        {t("access.go_home")}
      </Link>
    </div>
  );
}
