import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { ArrowLeft, ClipboardCheck, CloudOff, Play, Radio, ScanLine, Undo2 } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { fmtQty, type Inventory, type Progress } from "./shared";

/**
 * Inventarizatsiya skaneri - RFID qurilmaning (yoki telefonning) brauzeri uchun.
 *
 * RFID skanerlar "klaviatura" rejimida ishlaydi: har o'qilgan metka kodi
 * maydonga yoziladi va Enter bosiladi. Shuning uchun maydon doim fokusda.
 * Kodlar to'planib, har 0.4 soniyada serverga bittada yuboriladi (skaner
 * sekundiga yuzlab metka o'qiydi). Tarmoq uzilsa kodlar yo'qolmaydi -
 * qurilmada saqlanib, qayta yuboriladi.
 *
 * Takror o'qilgan metka jim o'tkaziladi; yangi dona - qisqa signal,
 * noma'lum metka yoki topilmagan kod - past signal va tebranish.
 */

type Status = "new" | "duplicate" | "unknown" | "barcode" | "not_found";
interface Result { code: string; status: Status; material?: { name: string; sku: string | null; size: string | null } | null }
interface Feed extends Result { at: number; key: string }

const FLUSH_MS = 400;
const queueKey = (id: string) => `gulbahor.inventory.queue.${id}`;
const loadQueue = (id: string): string[] => { try { return JSON.parse(localStorage.getItem(queueKey(id)) || "[]"); } catch { return []; } };
const saveQueue = (id: string, list: string[]) => { try { localStorage.setItem(queueKey(id), JSON.stringify(list)); } catch { /* xotira yopiq */ } };

/** Qisqa ovozli signal (WebAudio - fayl kerak emas) */
let audio: AudioContext | null = null;
function beep(frequency: number, ms: number) {
  try {
    audio = audio || new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + ms / 1000);
  } catch { /* ovoz o'chiq */ }
}

const TONE: Record<Status, string> = {
  new: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  barcode: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  duplicate: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  unknown: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  not_found: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export default function InventoryScan() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { can } = usePermissions();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [inv, setInv] = useState<Inventory | null>(null);
  const [progress, setProgress] = useState<Progress>({ counted: 0, skuCount: 0, unknown: 0, lastScanAt: null });
  const [feed, setFeed] = useState<Feed[]>([]);
  const [pending, setPending] = useState(0);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState({ fresh: 0, duplicate: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef<string[]>(loadQueue(id));
  const sending = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory/${id}`, { headers: auth });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
      setInv(data);
      setProgress(data.progress);
    } catch (err: any) {
      setError(err.message);
    }
  }, [auth, id, t]);

  useEffect(() => { if (token) load(); }, [token, load]);

  /** To'plangan kodlarni yuborish; xato bo'lsa navbatda qoladi */
  const flush = useCallback(async () => {
    if (sending.current || !queue.current.length || inv?.status !== "IN_PROGRESS") return;
    sending.current = true;
    const batch = queue.current.slice(0, 1000);
    try {
      const res = await fetch(`/api/inventory/${id}/scans`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ codes: batch }),
      });
      const data = await readJson(res);
      if (res.status >= 500 || res.status === 0) throw new Error("offline");
      queue.current = queue.current.slice(batch.length);
      saveQueue(id, queue.current);
      setOffline(false);
      if (!res.ok) {
        // Inventarizatsiya yopilgan va hokazo - bu kodlarni qayta yuborishdan foyda yo'q
        setError(errorMessage(data, t("common.error")));
        return;
      }
      setProgress(data.progress);
      const results: Result[] = data.results;
      const now = Date.now();
      const visible = results.filter((item) => item.status !== "duplicate");
      if (visible.length) setFeed((prev) => [...visible.map((item, index) => ({ ...item, at: now, key: `${now}-${index}` })).reverse(), ...prev].slice(0, 60));
      setSession((prev) => ({
        fresh: prev.fresh + results.filter((item) => item.status === "new" || item.status === "barcode").length,
        duplicate: prev.duplicate + results.filter((item) => item.status === "duplicate").length,
      }));
      if (results.some((item) => item.status === "not_found" || item.status === "unknown")) {
        beep(320, 220);
        navigator.vibrate?.(200);
      } else if (results.some((item) => item.status === "new" || item.status === "barcode")) beep(1760, 50);
    } catch {
      setOffline(true);
    } finally {
      sending.current = false;
      setPending(queue.current.length);
    }
  }, [auth, id, inv?.status, t]);

  useEffect(() => {
    const timer = window.setInterval(flush, FLUSH_MS);
    return () => window.clearInterval(timer);
  }, [flush]);

  // Ekran o'chib qolmasin (qo'llab-quvvatlasa)
  useEffect(() => {
    let lock: any = null;
    (navigator as any).wakeLock?.request?.("screen").then((l: any) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch?.(() => {}); };
  }, []);

  // Maydon doim fokusda - skaner "klaviatura" sifatida yozadi
  useEffect(() => {
    const keep = window.setInterval(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active !== inputRef.current && !(active && ["BUTTON", "A", "SELECT"].includes(active.tagName))) inputRef.current?.focus();
    }, 800);
    return () => window.clearInterval(keep);
  }, []);

  const push = (raw: string) => {
    const codes = raw.split(/[\r\n\t,;]+/).map((code) => code.trim()).filter(Boolean);
    if (!codes.length) return;
    queue.current.push(...codes);
    saveQueue(id, queue.current);
    setPending(queue.current.length);
  };

  const start = async () => {
    try {
      setBusy(true);
      const res = await fetch(`/api/inventory/${id}/start`, { method: "POST", headers: auth });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.error")));
      setInv(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  /** Oxirgi yozilgan donani bekor qilish (xato skanerlangan) */
  const undo = async () => {
    try {
      setBusy(true);
      const res = await fetch(`/api/inventory/${id}/scans?limit=1`, { headers: auth });
      const [last] = await res.json();
      if (!last) return;
      const del = await fetch(`/api/inventory/${id}/scans/${last.id}`, { method: "DELETE", headers: auth });
      const data = await readJson(del);
      if (!del.ok) throw new Error(errorMessage(data, t("common.error")));
      setProgress(data);
      setFeed((prev) => [{ code: last.epc || last.code, status: "duplicate" as Status, material: last.material, at: Date.now(), key: `undo-${last.id}` }, ...prev]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const finish = async () => {
    if (queue.current.length) return setError(t("inventory.pending_first"));
    if (!window.confirm(t("inventory.finish_confirm"))) return;
    try {
      setBusy(true);
      const res = await fetch(`/api/inventory/${id}/finish`, { method: "POST", headers: auth });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.error")));
      navigate(`/inventory/${id}`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const label = (status: Status) => t(`inventory.scan_${status}`);

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-white">
      <PageMeta title={`${inv?.number || ""} ${t("inventory.scanner")} | Gulbahor`} description={t("modules.inventory.desc")} />
      <header className="flex items-center gap-2 bg-gray-900 px-3 py-2 text-white">
        <Link to={`/inventory/${id}`} aria-label={t("inbounds.back")} className="rounded-lg p-2 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{inv?.number} · {inv?.warehouse?.name}</div>
          <div className="truncate text-xs text-white/60">{inv?.branch?.name}{inv ? ` · ${t(`inventory.status_${inv.status}`)}` : ""}</div>
        </div>
        {offline && <span className="flex items-center gap-1 rounded bg-red-500/80 px-2 py-1 text-xs"><CloudOff className="h-3.5 w-3.5" />{t("inventory.offline")}</span>}
      </header>

      {/* Hisoblagichlar */}
      <div className="grid grid-cols-3 gap-2 p-3">
        <div className="rounded-xl bg-white p-3 text-center dark:bg-gray-900">
          <div className="text-3xl font-bold tabular-nums text-brand-600 dark:text-brand-400">{fmtQty(progress.counted)}</div>
          <div className="text-xs text-gray-500">{t("inventory.counted")}</div>
        </div>
        <div className="rounded-xl bg-white p-3 text-center dark:bg-gray-900">
          <div className="text-3xl font-bold tabular-nums">{fmtQty(progress.skuCount)}</div>
          <div className="text-xs text-gray-500">SKU</div>
        </div>
        <div className="rounded-xl bg-white p-3 text-center dark:bg-gray-900">
          <div className={`text-3xl font-bold tabular-nums ${progress.unknown ? "text-amber-600" : ""}`}>{fmtQty(progress.unknown)}</div>
          <div className="text-xs text-gray-500">{t("inventory.unknown")}</div>
        </div>
      </div>

      {error && <p role="alert" onClick={() => setError("")} className="mx-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10">{error}</p>}

      {inv?.status === "PLANNED" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">{t("inventory.not_started")}</p>
          {(can("update:inventory") || can("scan:inventory")) && (
            <button onClick={start} disabled={busy} className="flex h-14 items-center gap-2 rounded-xl bg-brand-500 px-8 text-lg font-bold text-white disabled:opacity-50"><Play className="h-5 w-5" />{t("inventory.start")}</button>
          )}
        </div>
      ) : inv && inv.status !== "IN_PROGRESS" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-600 dark:text-gray-300">
          {t("inventory.closed")}
          <Link to={`/inventory/${id}`} className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white">{t("inventory.view_report")}</Link>
        </div>
      ) : (
        <>
          {/* Skaner maydoni */}
          <form className="px-3 pt-3" onSubmit={(e) => { e.preventDefault(); push(value); setValue(""); }}>
            <label className="relative block">
              <Radio className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-pulse text-brand-500" />
              <input
                ref={inputRef} autoFocus value={value} autoComplete="off" autoCapitalize="off" spellCheck={false}
                onChange={(e) => setValue(e.target.value)}
                onPaste={(e) => { const text = e.clipboardData.getData("text"); if (/[\r\n]/.test(text)) { e.preventDefault(); push(text); } }}
                placeholder={t("inventory.scan_placeholder")}
                className="h-14 w-full rounded-xl border-2 border-brand-400 bg-white pl-11 pr-3 font-mono text-base focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:bg-gray-900"
              />
            </label>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>{t("inventory.session", { fresh: session.fresh, duplicate: session.duplicate })}</span>
              {pending > 0 && <span className="font-medium text-amber-600">{t("inventory.pending", { count: pending })}</span>}
            </div>
          </form>

          {/* Oxirgi o'qilganlar */}
          <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
            {feed.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-400"><ScanLine className="h-10 w-10" />{t("inventory.scan_hint")}</li>
            )}
            {feed.map((item) => (
              <li key={item.key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-gray-900">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONE[item.status]}`}>{label(item.status)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.material ? `${item.material.name}${item.material.size ? ` · ${item.material.size}` : ""}` : "—"}</span>
                  <span className="block truncate font-mono text-[11px] text-gray-400">{item.code}</span>
                </span>
                <span className="text-[11px] tabular-nums text-gray-400">{dayjs(item.at).format("HH:mm:ss")}</span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-2 border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <button onClick={undo} disabled={busy || progress.counted + progress.unknown === 0} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 font-semibold disabled:opacity-40 dark:border-gray-700">
              <Undo2 className="h-5 w-5" />{t("inventory.undo")}
            </button>
            {can("update:inventory") ? (
              <button onClick={finish} disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50">
                <ClipboardCheck className="h-5 w-5" />{t("inventory.finish")}
              </button>
            ) : <span />}
          </div>
        </>
      )}
    </div>
  );
}
