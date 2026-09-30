import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ImageOff, Plus, Search, X } from "lucide-react";
import { localized, type LocalizedName } from "../../utils/localized";

/** Hujjat formalarida tanlanadigan tovar - /api/materials/search va /by-barcode shu shaklda qaytaradi */
export interface PickedMaterial {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: { name: LocalizedName; shortName: LocalizedName } | null;
  color: { name: LocalizedName; hex: string | null } | null;
  size: { name: string } | null;
  brand: { name: string } | null;
  images: { url: string; isMain: boolean }[];
}

/** "M · Qora · Zara" - tovarni farqlovchi qisqa tavsif */
export function materialDetails(material: PickedMaterial, lang: string) {
  return [material.size?.name, localized(material.color?.name, lang), material.brand?.name].filter(Boolean).join(" · ");
}

/**
 * Tovar qidirish oynasi: nom, artikul, shtrix-kod yoki MXIK bo'yicha.
 *
 * Qidiruv serverda ishlaydi (tovarlar ro'yxati brauzerga to'liq
 * yuklanmaydi). Oyna tovar qo'shilgandan keyin yopilmaydi - bir yo'la bir
 * nechta tovar tanlash mumkin; qo'shilgani belgilab qo'yiladi.
 */
export default function ProductSearchModal({ token, addedIds, onPick, onClose }: {
  token: string | null;
  /** Hujjatda allaqachon bor tovarlar - belgilab ko'rsatiladi */
  addedIds: Set<string>;
  onPick: (material: PickedMaterial) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PickedMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Yozish to'xtagach izlaydi; eskirgan javob yangisini bosib ketmasin
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/materials/search?limit=50&q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError(t("common.load_error"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, query ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, token, t]);

  return (
    <div className="fixed inset-0 z-[100000] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-16" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <Search className="h-5 w-5 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("documents.search_placeholder")}
            className="flex-1 bg-transparent text-base text-gray-800 placeholder-gray-400 focus:outline-none dark:text-white/90"
          />
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {error ? (
            <p className="py-10 text-center text-sm text-red-500">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">{isLoading ? t("common.loading") : t("common.nothing_found")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((material) => {
                const image = material.images?.find((item) => item.isMain) || material.images?.[0];
                const added = addedIds.has(material.id);
                const details = materialDetails(material, i18n.language);
                return (
                  <li key={material.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5">
                    {image ? (
                      <img src={image.url} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-700" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-300 dark:border-gray-700 dark:text-gray-600">
                        <ImageOff className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{material.name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {[details, material.sku, material.barcode].filter(Boolean).join("  ·  ") || "—"}
                      </p>
                    </div>
                    <button
                      onClick={() => onPick(material)}
                      className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors ${
                        added
                          ? "border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400"
                          : "bg-brand-500 text-white hover:bg-brand-600"
                      }`}
                    >
                      {added ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {added ? t("documents.add_more") : t("common.add")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400 dark:border-gray-800">
          {t("documents.search_hint", { count: rows.length })}
        </div>
      </div>
    </div>
  );
}
