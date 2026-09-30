import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe } from "lucide-react";
import { LANGUAGES, changeLanguage } from "../../i18n";

/**
 * Til tanlagich. Tillar ro'yxati i18n.ts dagi LANGUAGES dan olinadi,
 * tanlov brauzerda saqlanadi (keyingi kirishda ham shu til).
 *
 * `align` - ro'yxat tugmaning qaysi chetiga yopishadi: "auto" sarlavha
 * uchun (tor ekranda chapga, kengida o'ngga), "left" - kirish sahifasi uchun.
 */
export default function LanguageDropdown({ align = "auto" }: { align?: "auto" | "left" }) {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdownRef.current?.contains(target as Node)) setIsOpen(false);
    };
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", clickHandler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", clickHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [isOpen]);

  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={t("header.language")}
        aria-label={t("header.language")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-gray-100 px-2.5 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <Globe className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase">{current.code}</span>
      </button>

      {isOpen && (
        <div
          className={`absolute mt-2 flex w-44 flex-col rounded-lg border border-gray-200 bg-white shadow-theme-md dark:border-gray-800 dark:bg-gray-900 z-50 ${
            align === "left" ? "left-0" : "left-0 right-auto lg:left-auto lg:right-0"
          }`}
        >
          <ul className="flex flex-col p-2 gap-1" role="listbox">
            {LANGUAGES.map((lang) => {
              const selected = current.code === lang.code;
              return (
                <li key={lang.code} role="option" aria-selected={selected}>
                  <button
                    onClick={() => {
                      changeLanguage(lang.code);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left ${
                      selected
                        ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400 font-medium"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="w-6 text-[11px] font-semibold uppercase text-gray-400">{lang.code}</span>
                    <span className="flex-1">{lang.name}</span>
                    {selected && <Check className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
