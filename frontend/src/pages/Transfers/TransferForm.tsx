import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  ArrowLeft, ArrowRight, Ban, CheckCheck, ClipboardCheck, ImageOff, PackageCheck, Radio, RotateCcw, Save, Search, Send, Trash2, Undo2,
} from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import ProductSearchModal, { materialDetails, type PickedMaterial } from "../../components/documents/ProductSearchModal";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { localized } from "../../utils/localized";
import { STATUS_STYLE, fmtQty, type Resolved, type TransferStatus } from "./shared";

/**
 * Ko'chirish hujjati.
 *
 *  - Yuboruvchi (qoralama): qayerdan / qayerga, tovarlar - skaner (shtrix-kod,
 *    artikul yoki RFID metka) yoki qidiruv orqali; "Yuborish".
 *  - Qabul qiluvchi (yuborilgan): kelgan tovarni sanaydi - RFID metkalar
 *    o'qiladi yoki shtrix-kod skanerlanadi (yoki soni qo'lda yoziladi);
 *    kam kelgani farq sifatida ko'rinadi; "Qabul qilish".
 */

interface Option { id: string; name: string; branchId?: string; isActive?: boolean }
interface Doc {
  id: string; number: string; status: TransferStatus; direction: "IN" | "OUT" | null; description: string | null; receiveNote: string | null;
  fromBranchId: string; fromWarehouseId: string; toBranchId: string; toWarehouseId: string;
  fromBranch: { name: string } | null; fromWarehouse: { name: string } | null; toBranch: { name: string } | null; toWarehouse: { name: string } | null;
  createdBy: { name: string } | null; sentBy: { name: string } | null; receivedBy: { name: string } | null;
  sentAt: string | null; receivedAt: string | null;
  items: { id: string; materialId: string; material: PickedMaterial; quantity: number; receivedQuantity: number | null; tags: number }[];
  tags: { epc: string; materialId: string; receivedAt: string | null }[];
}
interface Line { key: string; materialId: string; material: PickedMaterial; quantity: string }
interface Feed { key: string; code: string; text: string; tone: "ok" | "dup" | "warn" }

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const cellInput = "h-9 w-24 rounded-lg border border-gray-300 bg-transparent px-2 text-right text-sm focus:border-brand-300 focus:outline-hidden dark:border-gray-700";
const th = "px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";
const num = (value: string) => Number(String(value || "").replace(",", ".")) || 0;
const TONE = { ok: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300", dup: "bg-gray-100 text-gray-500 dark:bg-gray-800", warn: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };

export default function TransferForm() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { can } = usePermissions();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [options, setOptions] = useState<{ branches: Option[]; warehouses: Option[]; myBranchId: string | null }>({ branches: [], warehouses: [], myBranchId: null });
  const [doc, setDoc] = useState<Doc | null>(null);
  const [header, setHeader] = useState({ fromWarehouseId: "", toWarehouseId: "", description: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [epcs, setEpcs] = useState<{ epc: string; materialId: string }[]>([]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [receivedEpcs, setReceivedEpcs] = useState<{ epc: string; materialId: string }[]>([]);
  const [note, setNote] = useState("");
  const [feed, setFeed] = useState<Feed[]>([]);
  const [scan, setScan] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(!!id);
  const queue = useRef<string[]>([]);
  const sending = useRef(false);

  const status: TransferStatus = doc?.status || "DRAFT";
  const editable = status === "DRAFT" && (id ? can("update:transfers") : can("create:transfers"));
  const receiving = status === "SENT" && can("receive:transfers") && doc?.direction !== "OUT";
  const receiveKey = id ? `gulbahor.transfer.receive.${id}` : "";

  const api = useCallback(async (url: string, method = "GET", body?: unknown) => {
    const res = await fetch(url, { method, headers: { ...auth, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await readJson(res);
    if (!res.ok) throw new Error(errorMessage(data, t("common.error")));
    return data;
  }, [auth, t]);

  const apply = (data: Doc) => {
    setDoc(data);
    setHeader({ fromWarehouseId: data.fromWarehouseId, toWarehouseId: data.toWarehouseId, description: data.description || "" });
    setLines(data.items.map((item) => ({ key: item.id, materialId: item.materialId, material: item.material, quantity: String(item.quantity) })));
    setEpcs(data.tags.map((tag) => ({ epc: tag.epc, materialId: tag.materialId })));
    setIsDirty(false);
  };

  useEffect(() => {
    if (!token) return;
    api("/api/transfers/options").then((data) => {
      setOptions(data);
      // Xodimning filialida bitta ombor bo'lsa - o'zi tanlanadi
      if (!id && data.myBranchId) {
        const own = data.warehouses.filter((w: Option) => w.branchId === data.myBranchId && w.isActive !== false);
        if (own.length === 1) setHeader((prev) => ({ ...prev, fromWarehouseId: own[0].id }));
      }
    }).catch(() => {});
    if (!id) return;
    api(`/api/transfers/${id}`).then(apply).catch((err) => setError(err.message)).finally(() => setIsLoading(false));
  }, [token, id, api]);

  // Qabul jarayoni qurilmada saqlanadi - sahifa yangilansa yo'qolmasin
  useEffect(() => {
    if (!receiving || !receiveKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(receiveKey) || "null");
      if (saved) { setReceived(saved.received || {}); setReceivedEpcs((saved.epcs || []).filter((item: any) => item?.epc)); setNote(saved.note || ""); }
    } catch { /* bo'sh */ }
  }, [receiving, receiveKey]);
  useEffect(() => {
    if (!receiving || !receiveKey) return;
    try { localStorage.setItem(receiveKey, JSON.stringify({ received, epcs: receivedEpcs, note })); } catch { /* xotira yopiq */ }
  }, [received, receivedEpcs, note, receiving, receiveKey]);

  const pushFeed = (items: Feed[]) => setFeed((prev) => [...items.reverse(), ...prev].slice(0, 40));
  const label = (material: any) => (material ? `${material.name}${material.size?.name ? ` · ${material.size.name}` : ""}` : "—");

  /* --------------------------------- Skaner --------------------------------- */

  /** Yuboruvchi: tovar qo'shish (RFID - har metka bir dona, shtrix-kod - +1) */
  const addResolved = (results: Resolved[]) => {
    const entries: Feed[] = [];
    let nextLines = lines;
    const nextEpcs = [...epcs];
    const bump = (material: any) => {
      const existing = nextLines.find((line) => line.materialId === material.id);
      nextLines = existing
        ? nextLines.map((line) => (line.materialId === material.id ? { ...line, quantity: String(num(line.quantity) + 1) } : line))
        : [...nextLines, { key: `new-${material.id}`, materialId: material.id, material, quantity: "1" }];
    };
    for (const result of results) {
      const key = `${Date.now()}-${Math.random()}`;
      if (result.status !== "ok") { entries.push({ key, code: result.code, text: t(result.status === "unknown" ? "transfers.scan_unknown" : "transfers.scan_not_found"), tone: "warn" }); continue; }
      if (result.kind === "epc") {
        if (nextEpcs.some((item) => item.epc === result.epc)) { entries.push({ key, code: result.code, text: label(result.material), tone: "dup" }); continue; }
        nextEpcs.push({ epc: result.epc!, materialId: result.material.id });
      }
      bump(result.material);
      entries.push({ key, code: result.code, text: label(result.material), tone: "ok" });
    }
    setLines(nextLines);
    setEpcs(nextEpcs);
    setIsDirty(true);
    pushFeed(entries);
  };

  /** Qabul qiluvchi: kelgan donani sanash */
  const countResolved = (results: Resolved[]) => {
    if (!doc) return;
    const entries: Feed[] = [];
    const next = { ...received };
    const nextEpcs = [...receivedEpcs];
    for (const result of results) {
      const key = `${Date.now()}-${Math.random()}`;
      if (result.status !== "ok") { entries.push({ key, code: result.code, text: t(result.status === "unknown" ? "transfers.scan_unknown" : "transfers.scan_not_found"), tone: "warn" }); continue; }
      const item = doc.items.find((row) => row.materialId === result.material.id);
      if (!item) { entries.push({ key, code: result.code, text: `${label(result.material)} — ${t("transfers.not_in_transfer")}`, tone: "warn" }); continue; }
      if (result.kind === "epc") {
        if (nextEpcs.some((read) => read.epc === result.epc)) { entries.push({ key, code: result.code, text: label(result.material), tone: "dup" }); continue; }
        if (!doc.tags.some((tag) => tag.epc === result.epc)) {
          // Metka yuborilganlar ro'yxatida yo'q: faqat metkasiz (qo'lda qo'shilgan) donalar soni doirasida qabul qilinadi
          const sentTags = doc.tags.filter((tag) => tag.materialId === item.materialId).length;
          const foreign = nextEpcs.filter((read) => read.materialId === item.materialId && !doc.tags.some((tag) => tag.epc === read.epc)).length;
          if (foreign >= item.quantity - sentTags) {
            entries.push({ key, code: result.code, text: `${label(result.material)} — ${t("transfers.tag_not_sent")}`, tone: "warn" }); continue;
          }
        }
      }
      const current = num(next[item.id] || "0");
      if (current + 1 > item.quantity) { entries.push({ key, code: result.code, text: `${label(result.material)} — ${t("transfers.over_sent")}`, tone: "warn" }); continue; }
      if (result.kind === "epc") nextEpcs.push({ epc: result.epc!, materialId: item.materialId });
      next[item.id] = String(current + 1);
      entries.push({ key, code: result.code, text: label(result.material), tone: "ok" });
    }
    setReceived(next);
    setReceivedEpcs(nextEpcs);
    pushFeed(entries);
  };

  const flush = useCallback(async () => {
    if (sending.current || !queue.current.length) return;
    sending.current = true;
    const batch = queue.current.splice(0, 500);
    try {
      const results: Resolved[] = await api("/api/transfers/resolve", "POST", { codes: batch });
      if (receiving) countResolved(results); else addResolved(results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      sending.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, receiving, lines, epcs, received, receivedEpcs, doc]);

  useEffect(() => {
    const timer = window.setInterval(flush, 350);
    return () => window.clearInterval(timer);
  }, [flush]);

  const submitScan = (raw: string) => {
    const codes = raw.split(/[\r\n\t,;]+/).map((code) => code.trim()).filter(Boolean);
    queue.current.push(...codes);
    setScan("");
  };

  /* --------------------------------- Qatorlar --------------------------------- */

  const tagsOf = (materialId: string) => epcs.filter((item) => item.materialId === materialId).length;
  const addPicked = (material: PickedMaterial) => {
    const existing = lines.find((line) => line.materialId === material.id);
    setLines(existing ? lines.map((line) => (line.materialId === material.id ? { ...line, quantity: String(num(line.quantity) + 1) } : line))
      : [...lines, { key: `new-${material.id}`, materialId: material.id, material, quantity: "1" }]);
    setIsDirty(true);
  };
  const removeLine = (line: Line) => {
    setLines(lines.filter((item) => item.key !== line.key));
    setEpcs(epcs.filter((item) => item.materialId !== line.materialId));
    setIsDirty(true);
  };

  /* --------------------------------- Amallar --------------------------------- */

  const validate = () => {
    if (!header.fromWarehouseId) return t("ref.required_field", { field: t("transfers.from") });
    if (!header.toWarehouseId) return t("ref.required_field", { field: t("transfers.to") });
    if (header.fromWarehouseId === header.toWarehouseId) return t("transfers.same_warehouse");
    for (const line of lines) {
      if (!(num(line.quantity) > 0)) return t("inbounds.quantity_error", { name: line.material.name });
      if (num(line.quantity) < tagsOf(line.materialId)) return t("transfers.less_than_tags", { name: line.material.name, count: tagsOf(line.materialId) });
    }
    return "";
  };

  const save = async (): Promise<Doc | null> => {
    const problem = validate();
    if (problem) { setError(problem); return null; }
    try {
      setBusy(true);
      setError("");
      const body = { ...header, items: lines.map((line) => ({ materialId: line.materialId, quantity: num(line.quantity) })), epcs: epcs.map((item) => item.epc) };
      const data: Doc = await api(id ? `/api/transfers/${id}` : "/api/transfers", id ? "PUT" : "POST", body);
      apply(data);
      if (!id) navigate(`/transfers/${data.id}`, { replace: true });
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const act = async (path: string, confirmText?: string, body?: unknown, targetId = doc?.id) => {
    if (confirmText && !window.confirm(confirmText)) return null;
    try {
      setBusy(true);
      setError("");
      const data: Doc = await api(`/api/transfers/${targetId}/${path}`, "POST", body);
      apply(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!lines.length) return setError(t("transfers.empty_error"));
    if (!window.confirm(t("transfers.send_confirm"))) return;
    const saved = isDirty || !id ? await save() : doc;
    // Yangi hujjat hozirgina saqlangan bo'lsa, holatdagi doc hali eski - id to'g'ridan-to'g'ri beriladi
    if (saved) await act("send", undefined, undefined, saved.id);
  };

  const receive = async () => {
    if (!doc) return;
    const shortage = doc.items.some((item) => num(received[item.id] || "0") < item.quantity);
    if (!window.confirm(shortage ? t("transfers.receive_short_confirm") : t("transfers.receive_confirm"))) return;
    const data = await act("receive", undefined, {
      items: doc.items.map((item) => ({ itemId: item.id, receivedQuantity: num(received[item.id] || "0") })),
      epcs: receivedEpcs.map((read) => read.epc), note,
    });
    if (data) try { localStorage.removeItem(receiveKey); } catch { /* xotira yopiq */ }
  };

  const remove = async () => {
    if (!doc || !window.confirm(t("ref.delete_confirm", { name: doc.number }))) return;
    try { await api(`/api/transfers/${doc.id}`, "DELETE"); navigate("/transfers"); } catch (err: any) { setError(err.message); }
  };

  /* -------------------------------- Ko'rinish -------------------------------- */

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-gray-500">{t("common.loading")}</div>;

  const branchName = (branchId?: string) => options.branches.find((branch) => branch.id === branchId)?.name || "";
  const fromChoices = options.warehouses.filter((w) => (w.isActive !== false || w.id === header.fromWarehouseId) && (!options.myBranchId || w.branchId === options.myBranchId));
  const toChoices = options.warehouses.filter((w) => (w.isActive !== false || w.id === header.toWarehouseId) && w.id !== header.fromWarehouseId);
  const grouped = (list: Option[]) => {
    const map = new Map<string, Option[]>();
    for (const item of list) map.set(item.branchId || "", [...(map.get(item.branchId || "") || []), item]);
    return [...map.entries()];
  };
  const totalSent = lines.reduce((sum, line) => sum + num(line.quantity), 0);
  const totalReceived = doc ? doc.items.reduce((sum, item) => sum + (receiving ? num(received[item.id] || "0") : item.receivedQuantity || 0), 0) : 0;
  const showScanner = editable || receiving;
  const title = doc ? doc.number : t("transfers.new");

  return (
    <>
      <PageMeta title={`${title} | ${t("modules.transfers.title")}`} description={t("modules.transfers.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-900 w-full">
        {/* Sarlavha */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-6 shrink-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link to="/transfers" aria-label={t("inbounds.back")} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-gray-700"><ArrowLeft className="h-4 w-4" /></Link>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{doc ? <span className="font-mono">{doc.number}</span> : t("transfers.new")}</h2>
            <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{t(`transfers.status_${status}`)}</span>
            {isDirty && <span className="text-xs font-medium text-amber-600">{t("inbounds.unsaved")}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {doc && status === "DRAFT" && can("delete:transfers") && (
              <Button variant="outline" onClick={remove} disabled={busy} className="flex h-8 items-center gap-1 px-3 text-xs text-red-500 border-red-200"><Trash2 className="h-3.5 w-3.5" />{t("common.delete")}</Button>
            )}
            {doc && status === "DRAFT" && can("update:transfers") && (
              <Button variant="outline" onClick={() => act("cancel", t("transfers.cancel_confirm"))} disabled={busy} className="flex h-8 items-center gap-1 px-3 text-xs"><Ban className="h-3.5 w-3.5" />{t("inventory.cancel")}</Button>
            )}
            {editable && (
              <Button variant="outline" onClick={() => save()} disabled={busy || (!isDirty && !!id)} className="flex h-8 items-center gap-1 px-3 text-xs"><Save className="h-3.5 w-3.5" />{t("common.save")}</Button>
            )}
            {editable && can("send:transfers") && (
              <Button onClick={send} disabled={busy} className="flex h-8 items-center gap-1 px-3 text-xs"><Send className="h-3.5 w-3.5" />{t("transfers.send")}</Button>
            )}
            {status === "SENT" && doc?.direction !== "IN" && can("send:transfers") && (
              <Button variant="outline" onClick={() => act("recall", t("transfers.recall_confirm"))} disabled={busy} className="flex h-8 items-center gap-1 px-3 text-xs"><RotateCcw className="h-3.5 w-3.5" />{t("transfers.recall")}</Button>
            )}
            {receiving && (
              <Button onClick={receive} disabled={busy} className="flex h-8 items-center gap-1 px-3 text-xs"><ClipboardCheck className="h-3.5 w-3.5" />{t("transfers.receive")}</Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-6xl space-y-4">
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10">{error}</div>}

            {/* Yo'nalish */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-5">
              {editable ? (
                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("transfers.from")} <span className="text-red-500">*</span></label>
                    <select name="fromWarehouseId" value={header.fromWarehouseId} onChange={(e) => { setHeader({ ...header, fromWarehouseId: e.target.value, toWarehouseId: header.toWarehouseId === e.target.value ? "" : header.toWarehouseId }); setIsDirty(true); }} className={inputClass}>
                      <option value="">{t("ref.choose")}</option>
                      {grouped(fromChoices).map(([branchId, list]) => <optgroup key={branchId} label={branchName(branchId)}>{list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</optgroup>)}
                    </select>
                  </div>
                  <ArrowRight className="mb-2.5 hidden h-5 w-5 text-gray-400 md:block" />
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("transfers.to")} <span className="text-red-500">*</span></label>
                    <select name="toWarehouseId" value={header.toWarehouseId} onChange={(e) => { setHeader({ ...header, toWarehouseId: e.target.value }); setIsDirty(true); }} className={inputClass}>
                      <option value="">{t("ref.choose")}</option>
                      {grouped(toChoices).map(([branchId, list]) => <optgroup key={branchId} label={branchName(branchId)}>{list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</optgroup>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("inbounds.description")}</label>
                    <input name="description" type="text" maxLength={2000} value={header.description} onChange={(e) => { setHeader({ ...header, description: e.target.value }); setIsDirty(true); }} className={inputClass} />
                  </div>
                </div>
              ) : doc && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span><span className="block text-xs text-gray-500">{t("transfers.from")}</span><b className="text-gray-900 dark:text-white">{doc.fromWarehouse?.name}</b> · {doc.fromBranch?.name}</span>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                    <span><span className="block text-xs text-gray-500">{t("transfers.to")}</span><b className="text-gray-900 dark:text-white">{doc.toWarehouse?.name}</b> · {doc.toBranch?.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                    {doc.createdBy && <span>{t("inbounds.created_by")}: {doc.createdBy.name}</span>}
                    {doc.sentAt && <span>{t("transfers.sent_at")}: {dayjs(doc.sentAt).format("DD.MM.YYYY HH:mm")}{doc.sentBy ? ` · ${doc.sentBy.name}` : ""}</span>}
                    {doc.receivedAt && <span>{t("transfers.received_at")}: {dayjs(doc.receivedAt).format("DD.MM.YYYY HH:mm")}{doc.receivedBy ? ` · ${doc.receivedBy.name}` : ""}</span>}
                  </div>
                  {doc.description && <p className="text-sm text-gray-700 dark:text-gray-300">{doc.description}</p>}
                  {doc.receiveNote && <p className="text-sm text-amber-700 dark:text-amber-300">{t("transfers.receive_note")}: {doc.receiveNote}</p>}
                </div>
              )}
            </div>

            {receiving && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 text-sm text-gray-700 dark:border-brand-500/30 dark:bg-brand-500/5 dark:text-gray-200">{t("transfers.receive_hint")}</div>
            )}

            {/* Tovarlar */}
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 md:px-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-white/90">
                  {t("inbounds.products")}
                  <span className="ml-3 text-xs font-normal normal-case text-gray-500">
                    {t("transfers.summary", { positions: doc && !editable ? doc.items.length : lines.length, sent: fmtQty(doc && !editable ? doc.items.reduce((s, i) => s + i.quantity, 0) : totalSent), tags: epcs.length })}
                    {(receiving || status === "RECEIVED") && <> · {t("transfers.received_qty")}: <b>{fmtQty(totalReceived)}</b></>}
                  </span>
                </h3>
                {receiving && (
                  <div className="flex gap-2">
                    <button onClick={() => { setReceived(Object.fromEntries(doc!.items.map((item) => [item.id, String(item.quantity)]))); setReceivedEpcs(doc!.tags.map((tag) => ({ epc: tag.epc, materialId: tag.materialId }))); }} className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-3 text-xs font-medium hover:bg-gray-50 dark:border-gray-700">
                      <CheckCheck className="h-3.5 w-3.5" />{t("transfers.receive_all")}
                    </button>
                    <button onClick={() => { setReceived({}); setReceivedEpcs([]); setFeed([]); }} className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-3 text-xs font-medium hover:bg-gray-50 dark:border-gray-700">
                      <Undo2 className="h-3.5 w-3.5" />{t("transfers.reset_count")}
                    </button>
                  </div>
                )}
              </div>

              {/* Skaner: shtrix-kod, artikul yoki RFID */}
              {showScanner && (
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700 md:px-5">
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submitScan(scan); }}>
                    <label className="relative flex-1">
                      <Radio className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
                      <input
                        autoFocus value={scan} onChange={(e) => setScan(e.target.value)} autoComplete="off" spellCheck={false}
                        onPaste={(e) => { const text = e.clipboardData.getData("text"); if (/[\r\n]/.test(text)) { e.preventDefault(); submitScan(text); } }}
                        placeholder={t("transfers.scan_placeholder")} className={`${inputClass} pl-9 font-mono`}
                      />
                    </label>
                    {editable && (
                      <button type="button" onClick={() => setIsSearchOpen(true)} className="flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">
                        <Search className="h-4 w-4" />{t("documents.search_button")}
                      </button>
                    )}
                  </form>
                  {feed.length > 0 && (
                    <ul className="mt-2 flex max-h-28 flex-col gap-1 overflow-y-auto text-xs">
                      {feed.map((item) => (
                        <li key={item.key} className="flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 font-semibold ${TONE[item.tone]}`}>{t(`transfers.feed_${item.tone}`)}</span>
                          <span className="truncate">{item.text}</span>
                          <span className="ml-auto font-mono text-gray-400">{item.code}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      <th className={`${th} pl-4 md:pl-5`}>{t("inbounds.product")}</th>
                      <th className={th}>{t("inbounds.unit")}</th>
                      <th className={`${th} text-right`}>{t("transfers.sent_qty")}</th>
                      <th className={`${th} text-right`}>RFID</th>
                      {(receiving || status === "RECEIVED") && <th className={`${th} text-right`}>{t("transfers.received_qty")}</th>}
                      {(receiving || status === "RECEIVED") && <th className={`${th} text-right`}>{t("inventory.difference")}</th>}
                      {editable && <th className={`${th} w-10`} />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {(editable ? lines.length : doc?.items.length) ? null : (
                      <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-500">{t("transfers.empty")}</td></tr>
                    )}
                    {editable ? lines.map((line) => {
                      const image = line.material.images?.find((img) => img.isMain) || line.material.images?.[0];
                      return (
                        <tr key={line.key}>
                          <td className="py-2 pl-4 pr-3 md:pl-5">
                            <span className="flex items-center gap-3">
                              {image ? <img src={image.url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-300"><ImageOff className="h-3.5 w-3.5" /></span>}
                              <span><span className="block text-sm font-medium text-gray-900 dark:text-white">{line.material.name}</span><span className="block text-xs text-gray-500">{[materialDetails(line.material, lang), line.material.sku, line.material.barcode].filter(Boolean).join(" · ")}</span></span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">{localized(line.material.unit?.shortName, lang) || "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <input value={line.quantity} inputMode="decimal" aria-label={t("transfers.sent_qty")} onFocus={(e) => e.target.select()}
                              onChange={(e) => { setLines(lines.map((item) => (item.key === line.key ? { ...item, quantity: e.target.value.replace(/[^\d.,]/g, "") } : item))); setIsDirty(true); }} className={cellInput} />
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums text-gray-500">{tagsOf(line.materialId) || "—"}</td>
                          <td className="px-3 py-2 text-right"><button onClick={() => removeLine(line)} aria-label={t("common.delete")} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      );
                    }) : doc?.items.map((item) => {
                      const got = receiving ? num(received[item.id] || "0") : item.receivedQuantity || 0;
                      const diff = got - item.quantity;
                      const image = item.material.images?.find((img) => img.isMain) || item.material.images?.[0];
                      const tagsReceived = doc.tags.filter((tag) => tag.materialId === item.materialId && (receiving ? receivedEpcs.some((read) => read.epc === tag.epc) : tag.receivedAt)).length;
                      return (
                        <tr key={item.id}>
                          <td className="py-2 pl-4 pr-3 md:pl-5">
                            <span className="flex items-center gap-3">
                              {image ? <img src={image.url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-300"><ImageOff className="h-3.5 w-3.5" /></span>}
                              <span><span className="block text-sm font-medium text-gray-900 dark:text-white">{item.material.name}</span><span className="block text-xs text-gray-500">{[materialDetails(item.material, lang), item.material.sku, item.material.barcode].filter(Boolean).join(" · ")}</span></span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">{localized(item.material.unit?.shortName, lang) || "—"}</td>
                          <td className="px-3 py-2 text-right text-sm font-medium tabular-nums">{fmtQty(item.quantity)}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-500">{item.tags ? ((receiving || status === "RECEIVED") ? `${tagsReceived}/${item.tags}` : item.tags) : "—"}</td>
                          {(receiving || status === "RECEIVED") && (
                            <td className="px-3 py-2 text-right">
                              {receiving ? (
                                <input value={received[item.id] ?? ""} placeholder="0" inputMode="decimal" aria-label={t("transfers.received_qty")} onFocus={(e) => e.target.select()}
                                  onChange={(e) => setReceived({ ...received, [item.id]: e.target.value.replace(/[^\d.,]/g, "") })} className={cellInput} />
                              ) : <span className="text-sm font-medium tabular-nums">{fmtQty(item.receivedQuantity)}</span>}
                            </td>
                          )}
                          {(receiving || status === "RECEIVED") && (
                            <td className={`px-3 py-2 text-right text-sm font-semibold tabular-nums ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                              {diff === 0 ? <PackageCheck className="ml-auto h-4 w-4" /> : fmtQty(diff)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {receiving && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("transfers.receive_note")}</label>
                <input name="note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={t("transfers.receive_note_placeholder")} className={inputClass} />
              </div>
            )}

            {/* RFID: qabul qilinmagan metkalar */}
            {status === "RECEIVED" && doc && doc.tags.some((tag) => !tag.receivedAt) && (
              <details className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm dark:border-red-500/30 dark:bg-red-500/5">
                <summary className="cursor-pointer font-medium text-red-700 dark:text-red-300">{t("transfers.missing_tags", { count: doc.tags.filter((tag) => !tag.receivedAt).length })}</summary>
                <div className="mt-2 flex flex-wrap gap-1.5">{doc.tags.filter((tag) => !tag.receivedAt).map((tag) => <code key={tag.epc} className="rounded bg-white px-2 py-0.5 font-mono text-xs dark:bg-gray-900">{tag.epc}</code>)}</div>
              </details>
            )}
          </div>
        </div>
      </div>

      {isSearchOpen && (
        <ProductSearchModal token={token} addedIds={new Set(lines.map((line) => line.materialId))} onPick={addPicked} onClose={() => setIsSearchOpen(false)} />
      )}
    </>
  );
}
