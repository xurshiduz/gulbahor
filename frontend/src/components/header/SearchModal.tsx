import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Search, X, CornerDownLeft } from "lucide-react";
import { MODULES, normalizeSearch } from "../../config/modules";
import { usePermissions } from "../../hooks/usePermissions";

/**
 * Yuqoridagi "Modullarni qidirish" oynasi (Ctrl+K / ⌘K).
 *
 * Ro'yxat haqiqiy bo'limlardan olinadi va foydalanuvchida "Ko'rish" huquqi
 * bor sahifalargina chiqadi. Yo'nalish react-router orqali - sahifa
 * qayta yuklanmaydi.
 */
export default function SearchModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canView } = usePermissions();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allowedModules = useMemo(
    () => MODULES.filter((m) => !m.resource || canView(m.resource, m.action)),
    [canView],
  );

  const filteredModules = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return allowedModules;
    return allowedModules.filter((m) =>
      [t(`modules.${m.key}.title`), t(`modules.${m.key}.desc`), m.path].some((field) =>
        normalizeSearch(field).includes(query),
      ),
    );
  }, [allowedModules, search, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const open = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  /** Strelkalar bilan tanlash, Enter bilan ochish */
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filteredModules.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filteredModules.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filteredModules.length) % filteredModules.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(filteredModules[activeIndex].path);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 xl:w-[300px] transition-colors"
      >
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left">{t("header.search_modules")}</span>
        <span className="hidden lg:flex items-center gap-0.5 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          Ctrl K
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[999999] flex items-start justify-center pt-20 sm:pt-24 bg-black/50 backdrop-blur-sm px-4">
          <div
            className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center border-b border-gray-200 dark:border-gray-800 p-4">
              <Search className="w-5 h-5 text-gray-400 mr-3" />
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent border-none text-gray-800 dark:text-white/90 placeholder-gray-400 focus:outline-none text-base"
                placeholder={t("header.search_modules")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <button
                onClick={() => setIsOpen(false)}
                aria-label={t("common.close")}
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {filteredModules.length > 0 ? (
                <div className="space-y-1">
                  {filteredModules.map((mod, index) => (
                    <button
                      key={mod.path}
                      onClick={() => open(mod.path)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                        index === activeIndex
                          ? "bg-gray-100 dark:bg-gray-800"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 text-white ${mod.color}`}>
                        {mod.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-700 dark:text-gray-200 truncate">{t(`modules.${mod.key}.title`)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t(`modules.${mod.key}.desc`)}</p>
                      </div>
                      {index === activeIndex && (
                        <CornerDownLeft className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                  {t("common.nothing_found")}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-800 px-4 py-2 text-[11px] text-gray-400">
              <span>{t("header.search_count", { count: filteredModules.length })}</span>
              <span className="hidden sm:inline">{t("header.search_hint")}</span>
            </div>
          </div>
          {/* Tashqariga bosilganda yopiladi */}
          <div className="absolute inset-0 -z-10" onClick={() => setIsOpen(false)}></div>
        </div>
      )}
    </>
  );
}
