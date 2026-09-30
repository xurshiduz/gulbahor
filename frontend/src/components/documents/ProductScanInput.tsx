import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanLine, Search } from "lucide-react";
import ProductSearchModal, { type PickedMaterial } from "./ProductSearchModal";

/**
 * Hujjat formalarida tovar qo'shishning ikki usuli:
 *
 * 1. Skaner - maydonga shtrix-kod (yoki artikul) o'qiladi, Enter bosiladi
 *    va tovar darhol qo'shiladi. Maydon fokusda qoladi - ketma-ket skanerlash uchun.
 * 2. Qidiruv - "Qidiruv" tugmasi oynani ochadi: nom, artikul, shtrix-kod
 *    yoki MXIK bo'yicha izlab, ro'yxatdan tanlanadi.
 */
export default function ProductScanInput({ token, addedIds, onPick, disabled = false }: {
  token: string | null;
  addedIds: Set<string>;
  onPick: (material: PickedMaterial) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Skanerlangan kod bo'yicha tovarni topib qo'shadi */
  const scan = async () => {
    const value = code.trim();
    if (!value || isBusy) return;

    setIsBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/materials/by-barcode?code=${encodeURIComponent(value)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return setError(t("documents.scan_not_found", { code: value }));
      if (!res.ok) throw new Error();
      onPick(await res.json());
      setCode("");
    } catch {
      setError(t("common.server_unreachable"));
    } finally {
      setIsBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={code}
            disabled={disabled}
            onChange={(e) => { setCode(e.target.value); if (error) setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scan(); } }}
            placeholder={t("documents.scan_placeholder")}
            autoComplete="off"
            className={`h-10 w-full rounded-lg border bg-transparent pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 ${
              error
                ? "border-red-400 focus:ring-red-500/20"
                : "border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700"
            }`}
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsSearchOpen(true)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <Search className="h-4 w-4" />
          {t("documents.search_button")}
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-500">{error}</p>}

      {isSearchOpen && (
        <ProductSearchModal
          token={token}
          addedIds={addedIds}
          onPick={onPick}
          onClose={() => { setIsSearchOpen(false); inputRef.current?.focus(); }}
        />
      )}
    </div>
  );
}
