import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Printer, Radio, X } from "lucide-react";
import Button from "../../components/ui/button/Button";
import { materialDetails, type PickedMaterial } from "../../components/documents/ProductSearchModal";
import { errorMessage, readJson } from "../../utils/api";

/**
 * Etiketka chop etish (RFID printer - Chainway CP30).
 *
 * Har bir DONA uchun alohida etiketka chiqadi va uning chipiga takrorlanmas
 * RFID kodi yoziladi: hujjatda 10 ta bo'lsa - 10 ta etiketka, 10 xil kod.
 * Kodlar serverda saqlanadi, shuning uchun qayta chop etilganda o'sha
 * donaning kodi o'zgarmaydi.
 *
 * Etiketkalar printerga server orqali yuboriladi (ZPL). Printer sozlanmagan
 * yoki serverdan ko'rinmasa - ZPL faylni yuklab olib, printer dasturi
 * orqali yuborish mumkin.
 */

interface LabelStatus {
  printer: { configured: boolean; address: string | null };
  sizes: string[];
  defaultSize: string;
  items: { materialId: string; quantity: number; units: number; printed: number }[];
}

export interface LabelRow { materialId: string; material: PickedMaterial }

const SIZE_KEY = "gulbahor.labelSize";
const remembered = (key: string) => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* xotira yopiq */ } };

const inputClass =
  "h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 whitespace-nowrap";

export default function LabelsModal({ token, documentId, rows, onClose }: {
  token: string | null;
  documentId: string;
  /** Etiketkasi chiqariladigan tovarlar: bitta qator yoki hujjatdagi hammasi */
  rows: LabelRow[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [status, setStatus] = useState<LabelStatus | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [size, setSize] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [rfid, setRfid] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Bitta tovar bir necha qatorda kelishi mumkin (qaytarish) - etiketka tovar bo'yicha
  const materials = useMemo(() => {
    const seen = new Map<string, PickedMaterial>();
    for (const row of rows) if (!seen.has(row.materialId)) seen.set(row.materialId, row.material);
    return [...seen].map(([materialId, material]) => ({ materialId, material }));
  }, [rows]);

  const load = async (initial: boolean) => {
    try {
      const res = await fetch(`/api/inbound-documents/${documentId}/labels`, { headers: auth });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
      setStatus(data);
      if (initial) {
        const saved = remembered(SIZE_KEY);
        setSize(data.sizes.includes(saved) ? saved : data.defaultSize);
        // Sukut bo'yicha - har donaga bittadan
        setCounts(Object.fromEntries(data.items.map((item: LabelStatus["items"][number]) => [item.materialId, String(item.units)])));
        // Bir qismi chop etilgan bo'lsa, sukut bo'yicha faqat qolgani chiqadi
        setOnlyNew(data.items.some((item: LabelStatus["items"][number]) => item.printed > 0 && item.printed < item.units));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const statusBy = useMemo(() => new Map((status?.items || []).map((item) => [item.materialId, item])), [status]);

  const countOf = (materialId: string) => {
    const info = statusBy.get(materialId);
    const value = Math.floor(Number(counts[materialId]) || 0);
    return Math.max(0, Math.min(value, info?.units || 0));
  };

  /** Haqiqatda nechta etiketka chiqadi ("faqat yangilari" hisobga olingan) */
  const willPrint = (materialId: string) => {
    const count = countOf(materialId);
    if (!onlyNew) return count;
    // Chop etilganlar 1-donadan boshlab ketma-ket - qolgani shundan keyingilari
    return Math.max(0, count - (statusBy.get(materialId)?.printed || 0));
  };

  const total = materials.reduce((sum, row) => sum + willPrint(row.materialId), 0);

  const send = async (mode: "print" | "zpl") => {
    try {
      setIsBusy(true);
      setError("");
      setMessage("");
      const res = await fetch(`/api/inbound-documents/${documentId}/labels/${mode}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: materials.map((row) => ({ materialId: row.materialId, count: countOf(row.materialId) })).filter((row) => row.count > 0),
          size,
          onlyNew,
          rfid,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.error")));

      if (mode === "zpl") {
        const url = URL.createObjectURL(new Blob([data.zpl], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = data.fileName;
        link.click();
        URL.revokeObjectURL(url);
        setMessage(t("labels.downloaded", { count: data.count }));
      } else {
        setMessage(t("labels.sent", { count: data.sent, printer: data.printer }));
      }
      await load(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-14">
      <div role="dialog" aria-modal="true" className="flex max-h-[84vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("labels.title")}</h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t("labels.hint")}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-100 px-5 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
          <label className="flex items-center gap-2">
            {t("labels.size")}
            <select value={size} onChange={(e) => { setSize(e.target.value); remember(SIZE_KEY, e.target.value); }} className={inputClass}>
              {(status?.sizes || []).map((key) => <option key={key} value={key}>{key.replace("x", " × ")} {t("labels.mm")}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rfid} onChange={(e) => setRfid(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500" />
            <Radio className="h-4 w-4 text-brand-500" /> {t("labels.write_rfid")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500" />
            {t("labels.only_new")}
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {!status && !error ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">{t("common.loading")}</div>
          ) : (
            <table className="min-w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className={`${th} pl-5`}>{t("inbounds.product")}</th>
                  <th className={`${th} text-right`}>{t("labels.units")}</th>
                  <th className={`${th} text-right`}>{t("labels.printed")}</th>
                  <th className={`${th} w-28 pr-5 text-right`}>{t("labels.count")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {materials.map(({ materialId, material }) => {
                  const info = statusBy.get(materialId);
                  return (
                    <tr key={materialId}>
                      <td className="py-2 pl-5 pr-3">
                        <span className="block text-sm font-medium text-gray-900 dark:text-white">{material.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {[materialDetails(material, i18n.language), material.sku, material.barcode].filter(Boolean).join("  ·  ") || "—"}
                        </span>
                        {!material.barcode && !material.sku && <span className="block text-xs text-amber-600 dark:text-amber-400">{t("labels.no_barcode")}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-700 dark:text-gray-300">{info?.units ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-sm">
                        {info && info.printed >= info.units && info.units > 0
                          ? <span className="font-medium text-green-600 dark:text-green-400">{info.printed}</span>
                          : <span className="text-gray-700 dark:text-gray-300">{info?.printed ?? 0}</span>}
                      </td>
                      <td className="py-2 pl-3 pr-5">
                        <input
                          type="text" inputMode="numeric" value={counts[materialId] ?? ""}
                          onChange={(e) => setCounts({ ...counts, [materialId]: e.target.value.replace(/\D/g, "") })}
                          onBlur={() => setCounts({ ...counts, [materialId]: String(countOf(materialId)) })}
                          onFocus={(e) => e.target.select()}
                          aria-label={t("labels.count")}
                          className={`${inputClass} w-full text-right`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{error}</div>}
          {message && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400">{message}</div>}
          {status && !status.printer.configured && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("labels.printer_missing")}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {t("labels.total", { count: total })}
              {status?.printer.address && <span className="ml-2 font-mono text-xs text-gray-400">{status.printer.address}</span>}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => send("zpl")} disabled={isBusy || !total} className="flex h-9 items-center gap-1.5 py-0">
                <Download className="h-4 w-4" /> {t("labels.download")}
              </Button>
              <Button size="sm" onClick={() => send("print")} disabled={isBusy || !total || !status?.printer.configured} className="flex h-9 items-center gap-1.5 py-0">
                <Printer className="h-4 w-4" /> {isBusy ? t("labels.sending") : t("labels.print")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
