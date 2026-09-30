import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { ArrowLeft, CheckCircle2, FileInput, ImageOff, ListChecks, Printer, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import ProductScanInput from "../../components/documents/ProductScanInput";
import { materialDetails, type PickedMaterial } from "../../components/documents/ProductSearchModal";
import { useReferenceList } from "../../components/reference/ReferenceCrud";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { localized } from "../../utils/localized";
import { CustomerSalesModal, SaleItemsModal } from "./SaleModals";
import LabelsModal from "./LabelsModal";
import {
  INBOUND_TYPES, STATUS_STYLE, TYPE_STYLE, formatMoney, formatQuantity, isReturnType, parseNumber,
  type FormItem, type InboundStatus, type InboundType, type SaleDocument, type SaleItem,
} from "./types";

/**
 * Kirim hujjati formasi.
 *
 *  - Xarid: yetkazib beruvchi, jo'natma raqami, izoh; tovarlar skaner yoki
 *    qidiruv oynasi orqali qo'shiladi, narxi qo'lda kiritiladi.
 *  - Qaytarish va almashinuv: mijoz; tovarlar faqat sotuv (chiqim)
 *    hujjatidan olinadi - chek raqami bo'yicha yoki mijozning sotuvlari
 *    ro'yxatidan. Narx sotuvdagi narx, soni qaytarish mumkin bo'lganidan oshmaydi.
 *
 * Hujjat "Saqlash" bosilganda to'liq (sarlavha + qatorlar) saqlanadi.
 * Tasdiqlangach o'zgartirilmaydi - kerak bo'lsa qoralamaga qaytariladi.
 */

interface ContractorRef { id: string; name: string; phone?: string | null; currencyId?: string | null; isActive?: boolean }
interface WarehouseRef { id: string; name: string; isActive?: boolean; branch?: { name: string } | null }
interface CurrencyRef { id: string; code: string; name: string }

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const cellInput =
  "h-9 w-full rounded-lg border border-gray-300 bg-transparent px-2 text-right text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:border-transparent disabled:bg-transparent dark:border-gray-700 dark:text-white/90";
const th = "px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";

const decimalOnly = (value: string) => value.replace(/[^\d.,]/g, "");

export default function InboundForm() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const { can, canCreate, canUpdate, canDelete } = usePermissions();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // Yangi hujjatning turi manzildan olinadi: /inbounds/create?type=RETURN
  const requestedType = searchParams.get("type") as InboundType;
  const [type, setType] = useState<InboundType>(INBOUND_TYPES.includes(requestedType) ? requestedType : "PURCHASE");
  const isReturn = isReturnType(type);

  const [status, setStatus] = useState<InboundStatus>("DRAFT");
  const [documentNumber, setDocumentNumber] = useState("");
  const [meta, setMeta] = useState<{ createdBy?: string; approvedBy?: string; approvedAt?: string }>({});
  const [header, setHeader] = useState({
    contractorId: "", warehouseId: "", currencyId: "", documentDate: dayjs().format("YYYY-MM-DD"), shipmentNumber: "", description: "",
  });
  const [items, setItems] = useState<FormItem[]>([]);
  const [isLoading, setIsLoading] = useState(!!id);
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  // Oxirgi qo'shilgan / o'zgargan qator - ko'zga tashlanishi uchun
  const [flashKey, setFlashKey] = useState("");
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  // Sotuvdan tanlash oynalari
  const [saleModal, setSaleModal] = useState<{ number?: string } | null>(null);
  const [isSalesListOpen, setIsSalesListOpen] = useState(false);
  // Etiketka oynasi: "all" - hujjatdagi hamma tovar, aks holda bitta tovar
  const [labelTarget, setLabelTarget] = useState<string | null>(null);

  const suppliers = useReferenceList<ContractorRef>("/api/suppliers");
  const customers = useReferenceList<ContractorRef>("/api/customers");
  const warehouses = useReferenceList<WarehouseRef>("/api/warehouses");
  const currencies = useReferenceList<CurrencyRef>("/api/currencies");
  const contractors = isReturn ? customers : suppliers;

  const isDraft = status === "DRAFT";
  const mayEdit = isDraft && (id ? canUpdate("inbound-documents") : canCreate("inbound-documents"));
  const mayApprove = can("approve:inbound-documents");
  const mayPrint = can("print:inbound-documents");

  /* --------------------------------- Yuklash --------------------------------- */

  const applyDocument = (doc: any) => {
    setType(doc.type);
    setStatus(doc.status);
    setDocumentNumber(doc.documentNumber);
    setMeta({ createdBy: doc.createdBy?.name, approvedBy: doc.approvedBy?.name, approvedAt: doc.approvedAt });
    setHeader({
      contractorId: doc.contractorId, warehouseId: doc.warehouseId, currencyId: doc.currencyId || "",
      documentDate: doc.documentDate, shipmentNumber: doc.shipmentNumber || "", description: doc.description || "",
    });
    setItems((doc.items || []).map((item: any): FormItem => ({
      key: item.id,
      materialId: item.materialId,
      material: item.material,
      quantity: String(item.quantity),
      price: String(item.price),
      sourceOutboundItemId: item.sourceOutboundItemId,
      saleNumber: item.sourceOutboundDocument?.documentNumber || null,
    })));
    setIsDirty(false);
  };

  useEffect(() => {
    if (!id || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/inbound-documents/${id}`, { headers: auth });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
        if (!cancelled) applyDocument(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  // Bitta ombor bo'lsa o'zi tanlanadi
  useEffect(() => {
    if (!id && !header.warehouseId && warehouses.length === 1) setHeader((prev) => ({ ...prev, warehouseId: warehouses[0].id }));
  }, [id, header.warehouseId, warehouses]);

  // Saqlanmagan o'zgarish bilan sahifa yopilsa brauzer ogohlantiradi
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  /* --------------------------------- Sarlavha -------------------------------- */

  const setField = (key: keyof typeof header, value: string) => {
    setHeader((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setError("");
  };

  const pickContractor = (contractorId: string) => {
    const supplier = suppliers.find((item) => item.id === contractorId);
    setHeader((prev) => ({
      ...prev,
      contractorId,
      // Xaridda yetkazib beruvchining hisob-kitob valyutasi o'zi qo'yiladi
      currencyId: !isReturn && supplier?.currencyId ? supplier.currencyId : prev.currencyId,
    }));
    setIsDirty(true);
    setError("");
  };

  /* ---------------------------------- Qatorlar --------------------------------- */

  const flash = (key: string) => {
    setFlashKey(key);
    setItemSearch("");
    window.setTimeout(() => rowRefs.current.get(key)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    window.setTimeout(() => setFlashKey((current) => (current === key ? "" : current)), 1500);
  };

  /** Skaner yoki qidiruvdan tovar qo'shish: bor bo'lsa soni bittaga oshadi */
  const addMaterial = (material: PickedMaterial) => {
    const existing = items.find((item) => item.materialId === material.id);
    if (existing) {
      setItems(items.map((item) => (item.key === existing.key ? { ...item, quantity: String((parseNumber(item.quantity) || 0) + 1) } : item)));
      flash(existing.key);
    } else {
      const key = `new-${material.id}`;
      setItems([...items, { key, materialId: material.id, material, quantity: "1", price: "" }]);
      flash(key);
    }
    setIsDirty(true);
    setError("");
  };

  /** Sotuv hujjatidan tanlangan tovarlar: bor qatorning soni almashtiriladi, yo'g'i qo'shiladi */
  const addFromSale = (sale: SaleDocument, picked: { item: SaleItem; quantity: number }[]) => {
    const next = [...items];
    for (const { item, quantity } of picked) {
      const index = next.findIndex((row) => row.sourceOutboundItemId === item.id);
      const row: FormItem = {
        key: index >= 0 ? next[index].key : `sale-${item.id}`,
        materialId: item.materialId,
        material: item.material,
        quantity: String(quantity),
        price: String(item.price),
        sourceOutboundItemId: item.id,
        saleNumber: sale.documentNumber,
      };
      if (index >= 0) next[index] = row; else next.push(row);
    }
    setItems(next);
    // Mijoz tanlanmagan bo'lsa chekdagi mijoz qo'yiladi
    if (!header.contractorId && sale.customer) setHeader((prev) => ({ ...prev, contractorId: sale.customer!.id }));
    setSaleModal(null);
    setIsDirty(true);
    setError("");
  };

  const updateItem = (key: string, patch: Partial<FormItem>) => {
    setItems(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setIsDirty(true);
    setError("");
  };

  const removeItem = (key: string) => {
    setItems(items.filter((item) => item.key !== key));
    setIsDirty(true);
  };

  const query = normalizeSearch(itemSearch);
  const shownItems = query
    ? items.filter((item) => normalizeSearch([item.material.name, item.material.sku, item.material.barcode, item.saleNumber].filter(Boolean).join(" ")).includes(query))
    : items;

  const totals = useMemo(() => ({
    quantity: items.reduce((sum, item) => sum + (parseNumber(item.quantity) || 0), 0),
    amount: items.reduce((sum, item) => sum + (parseNumber(item.quantity) || 0) * (parseNumber(item.price) || 0), 0),
  }), [items]);

  const addedIds = useMemo(() => new Set(items.map((item) => item.materialId)), [items]);
  const currentReturns = useMemo(
    () => Object.fromEntries(items.filter((item) => item.sourceOutboundItemId).map((item) => [item.sourceOutboundItemId as string, item.quantity])),
    [items],
  );
  const currencyCode = currencies.find((currency) => currency.id === header.currencyId)?.code || t("currencies.sum");

  /* --------------------------------- Saqlash --------------------------------- */

  const request = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { ...auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(errorMessage(data, t("common.save_error")));
    return data;
  };

  /** Formani tekshiradi; xato bo'lsa matnini qaytaradi */
  const validate = () => {
    if (!header.contractorId) return t("ref.required_field", { field: isReturn ? t("inbounds.customer") : t("inbounds.supplier") });
    if (!header.warehouseId) return t("ref.required_field", { field: t("inbounds.warehouse") });
    for (const item of items) {
      const quantity = parseNumber(item.quantity);
      if (!(quantity > 0)) return t("inbounds.quantity_error", { name: item.material.name });
      const price = item.price === "" ? 0 : parseNumber(item.price);
      if (!(price >= 0)) return t("inbounds.price_error", { name: item.material.name });
    }
    return "";
  };

  /** Saqlaydi va saqlangan hujjatni qaytaradi (xato bo'lsa null) */
  const save = async (): Promise<any | null> => {
    const problem = validate();
    if (problem) { setError(problem); return null; }

    const payload = {
      ...(id ? {} : { type }),
      contractorId: header.contractorId,
      warehouseId: header.warehouseId,
      currencyId: header.currencyId || null,
      documentDate: header.documentDate,
      shipmentNumber: header.shipmentNumber,
      description: header.description,
      items: items.map((item) => ({
        materialId: item.materialId,
        quantity: parseNumber(item.quantity),
        price: item.price === "" ? 0 : parseNumber(item.price),
        ...(item.sourceOutboundItemId ? { sourceOutboundItemId: item.sourceOutboundItemId } : {}),
      })),
    };

    try {
      setIsBusy(true);
      setError("");
      const doc = await request(id ? `/api/inbound-documents/${id}` : "/api/inbound-documents", id ? "PUT" : "POST", payload);
      applyDocument(doc);
      // Yangi hujjat saqlangach o'z manziliga o'tadi - sahifa yangilansa yo'qolmaydi
      if (!id) navigate(`/inbounds/${doc.id}`, { replace: true });
      return doc;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const approve = async () => {
    if (!items.length) return setError(t("inbounds.empty_error"));
    if (!window.confirm(t("inbounds.approve_confirm"))) return;
    // Saqlanmagan o'zgarishlar avval saqlanadi
    const doc = isDirty || !id ? await save() : { id };
    if (!doc) return;
    try {
      setIsBusy(true);
      applyDocument(await request(`/api/inbound-documents/${doc.id}/approve`, "POST"));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const revert = async () => {
    if (!id || !window.confirm(t("inbounds.revert_confirm"))) return;
    try {
      setIsBusy(true);
      setError("");
      applyDocument(await request(`/api/inbound-documents/${id}/revert`, "POST"));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm(t("ref.delete_confirm", { name: documentNumber }))) return;
    try {
      setIsBusy(true);
      await request(`/api/inbound-documents/${id}`, "DELETE");
      setIsDirty(false);
      navigate("/inbounds");
    } catch (err: any) {
      setError(err.message);
      setIsBusy(false);
    }
  };

  /** Etiketka saqlangan hujjatdan chiqadi - kodlar serverdagi sonlarga bog'lanadi */
  const openLabels = (target: string) => {
    if (!id || isDirty) return setError(t("labels.save_first"));
    setError("");
    setLabelTarget(target);
  };

  const openSalesList = () => {
    if (!header.contractorId) return setError(t("inbounds.choose_customer_first"));
    setIsSalesListOpen(true);
  };

  const title = id ? `${t(`inbounds.type_${type}`)} ${documentNumber}` : t(`inbounds.new_${type}`);

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-500">{t("common.loading")}</div>;
  }

  return (
    <>
      <PageMeta title={`${title} | Gulbahor`} description={t("modules.inbounds.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-900 w-full">
        {/* Sarlavha paneli */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-6 shrink-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link to="/inbounds" aria-label={t("inbounds.back")} title={t("inbounds.back")} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${TYPE_STYLE[type]}`}>{t(`inbounds.type_${type}`)}</span>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {id ? <span className="font-mono">{documentNumber}</span> : t("inbounds.new_document")}
            </h2>
            <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{t(`inbounds.status_${status}`)}</span>
            {isDirty && <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("inbounds.unsaved")}</span>}
            {meta.createdBy && (
              <span className="hidden text-xs text-gray-500 dark:text-gray-400 lg:inline">
                {t("inbounds.created_by")}: {meta.createdBy}
                {meta.approvedBy && ` · ${t("inbounds.approved_by")}: ${meta.approvedBy}${meta.approvedAt ? `, ${dayjs(meta.approvedAt).format("DD.MM.YYYY HH:mm")}` : ""}`}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {id && isDraft && canDelete("inbound-documents") && (
              <Button variant="outline" onClick={remove} disabled={isBusy} className="flex h-8 items-center gap-1 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50 dark:border-red-500/30">
                <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
              </Button>
            )}
            {mayEdit && (
              <Button variant="outline" onClick={() => save()} disabled={isBusy || (!isDirty && !!id)} className="flex h-8 items-center gap-1 px-3 text-xs">
                <Save className="h-3.5 w-3.5" /> {isBusy ? t("common.saving") : t("common.save")}
              </Button>
            )}
            {isDraft && mayApprove && mayEdit && (
              <Button onClick={approve} disabled={isBusy} className="flex h-8 items-center gap-1 px-3 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("inbounds.approve")}
              </Button>
            )}
            {!isDraft && mayApprove && (
              <Button variant="outline" onClick={revert} disabled={isBusy} className="flex h-8 items-center gap-1 px-3 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> {t("inbounds.revert")}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-6xl space-y-4">
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Asosiy ma'lumotlar */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                <div className="md:col-span-3">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isReturn ? t("inbounds.customer") : t("inbounds.supplier")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={header.contractorId}
                    // Qaytarishda tovar qo'shilgach mijoz o'zgarmaydi - tovarlar shu mijozning sotuvlaridan
                    disabled={!mayEdit || (isReturn && items.length > 0)}
                    onChange={(e) => pickContractor(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t("ref.choose")}</option>
                    {contractors.filter((c) => c.isActive !== false || c.id === header.contractorId).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
                    ))}
                  </select>
                  {isReturn && items.length > 0 && mayEdit && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("inbounds.customer_locked")}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("inbounds.warehouse")} <span className="text-red-500">*</span>
                  </label>
                  <select value={header.warehouseId} disabled={!mayEdit} onChange={(e) => setField("warehouseId", e.target.value)} className={inputClass}>
                    <option value="">{t("ref.choose")}</option>
                    {warehouses.filter((w) => w.isActive !== false || w.id === header.warehouseId).map((w) => (
                      <option key={w.id} value={w.id}>{w.name}{w.branch ? ` (${w.branch.name})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("inbounds.date")}</label>
                  <input type="date" value={header.documentDate} disabled={!mayEdit} onChange={(e) => setField("documentDate", e.target.value)} className={inputClass} />
                </div>

                {/* Jo'natma raqami va valyuta faqat xaridda */}
                {!isReturn && (
                  <>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("inbounds.shipment")}</label>
                      <input
                        type="text" maxLength={100} value={header.shipmentNumber} disabled={!mayEdit}
                        onChange={(e) => setField("shipmentNumber", e.target.value)}
                        placeholder="TAHU-9041849"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div className="md:col-span-1">
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("inbounds.currency")}</label>
                      <select value={header.currencyId} disabled={!mayEdit} onChange={(e) => setField("currencyId", e.target.value)} className={inputClass}>
                        <option value="">{t("currencies.sum")}</option>
                        {currencies.filter((c) => c.code !== "UZS").map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <div className={isReturn ? "md:col-span-6" : "md:col-span-3"}>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("inbounds.description")}</label>
                  <input type="text" maxLength={2000} value={header.description} disabled={!mayEdit} onChange={(e) => setField("description", e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Tovarlar */}
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 md:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-white/90">{t("inbounds.products")}</h3>
                  {/* Jamilar: pozitsiya, umumiy soni, summa */}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t("inbounds.summary", { positions: items.length, quantity: formatQuantity(totals.quantity) })}
                    {" · "}<b className="text-gray-800 dark:text-white">{formatMoney(totals.amount)}</b> {currencyCode}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {items.length > 5 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
                        placeholder={t("inbounds.items_search")}
                        className="h-8 w-48 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </div>
                  )}
                  {mayPrint && items.length > 0 && (
                    <button
                      onClick={() => openLabels("all")}
                      title={t("labels.all_hint")}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Printer className="h-3.5 w-3.5" /> {t("labels.button")}
                    </button>
                  )}
                  {/* Qaytarish va almashinuvda tovar sotuv hujjatidan olinadi */}
                  {isReturn && mayEdit && (
                    <>
                      <button
                        onClick={() => setSaleModal({})}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-medium text-brand-600 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
                      >
                        <FileInput className="h-3.5 w-3.5" /> {t("inbounds.by_receipt")}
                      </button>
                      <button
                        onClick={openSalesList}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-medium text-brand-600 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
                      >
                        <ListChecks className="h-3.5 w-3.5" /> {t("inbounds.customer_sales")}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Xaridda: skaner va qidiruv */}
              {!isReturn && mayEdit && (
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700 md:px-5">
                  <ProductScanInput token={token} addedIds={addedIds} onPick={addMaterial} />
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      <th className={`${th} w-10 pl-4 md:pl-5`}>#</th>
                      <th className={th}>{t("inbounds.product")}</th>
                      {isReturn && <th className={th}>{t("inbounds.receipt")}</th>}
                      <th className={th}>{t("inbounds.unit")}</th>
                      <th className={`${th} w-32 text-right`}>{t("inbounds.quantity")}</th>
                      <th className={`${th} w-40 text-right`}>{t("inbounds.price")}</th>
                      <th className={`${th} w-40 text-right`}>{t("inbounds.amount")}</th>
                      {mayPrint && <th className={`${th} w-10`} />}
                      {mayEdit && <th className={`${th} w-10`} />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {shownItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">
                          {items.length ? t("common.nothing_found") : isReturn ? t("inbounds.empty_return") : t("inbounds.empty_purchase")}
                        </td>
                      </tr>
                    ) : (
                      shownItems.map((item) => {
                        const image = item.material.images?.find((img) => img.isMain) || item.material.images?.[0];
                        const quantity = parseNumber(item.quantity) || 0;
                        const price = parseNumber(item.price) || 0;
                        return (
                          <tr
                            key={item.key}
                            ref={(el) => { if (el) rowRefs.current.set(item.key, el); else rowRefs.current.delete(item.key); }}
                            className={`transition-colors duration-700 ${flashKey === item.key ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
                          >
                            <td className="pl-4 pr-3 py-2 text-sm text-gray-400 md:pl-5">{items.indexOf(item) + 1}</td>
                            <td className="px-3 py-2">
                              <span className="flex items-center gap-3">
                                {image ? (
                                  <img src={image.url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-700" />
                                ) : (
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-300 dark:border-gray-600">
                                    <ImageOff className="h-3.5 w-3.5" />
                                  </span>
                                )}
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-gray-900 dark:text-white">{item.material.name}</span>
                                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    {[materialDetails(item.material, lang), item.material.sku, item.material.barcode].filter(Boolean).join("  ·  ") || "—"}
                                  </span>
                                </span>
                              </span>
                            </td>
                            {isReturn && <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{item.saleNumber || "—"}</td>}
                            <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{localized(item.material.unit?.shortName, lang) || "—"}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text" inputMode="decimal" value={item.quantity} disabled={!mayEdit}
                                onChange={(e) => updateItem(item.key, { quantity: decimalOnly(e.target.value) })}
                                onFocus={(e) => e.target.select()}
                                aria-label={t("inbounds.quantity")}
                                className={cellInput}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text" inputMode="decimal" value={item.price}
                                // Qaytarishda narx sotuvdan olinadi - o'zgartirilmaydi
                                disabled={!mayEdit || isReturn}
                                onChange={(e) => updateItem(item.key, { price: decimalOnly(e.target.value) })}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                aria-label={t("inbounds.price")}
                                className={cellInput}
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{formatMoney(quantity * price)}</td>
                            {mayPrint && (
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => openLabels(item.materialId)}
                                  title={t("labels.button")} aria-label={t("labels.button")}
                                  className="rounded-md bg-brand-50 p-1 text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                              </td>
                            )}
                            {mayEdit && (
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => removeItem(item.key)} title={t("common.delete")} aria-label={t("common.delete")} className="text-gray-400 hover:text-red-500">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot className="border-t border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-800/60 dark:text-white">
                      <tr>
                        <td colSpan={isReturn ? 4 : 3} className="px-5 py-2.5 text-right">{t("inbounds.total")}:</td>
                        <td className="px-3 py-2.5 pr-5 text-right">{formatQuantity(totals.quantity)}</td>
                        <td />
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(totals.amount)} <span className="text-xs font-normal text-gray-400">{currencyCode}</span></td>
                        {mayPrint && <td />}
                        {mayEdit && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {saleModal && (
        <SaleItemsModal
          token={token}
          excludeDocumentId={id}
          initialNumber={saleModal.number}
          customerId={header.contractorId || undefined}
          current={currentReturns}
          onAdd={addFromSale}
          onClose={() => setSaleModal(null)}
        />
      )}
      {labelTarget && id && (
        <LabelsModal
          token={token}
          documentId={id}
          rows={labelTarget === "all" ? items : items.filter((item) => item.materialId === labelTarget)}
          onClose={() => setLabelTarget(null)}
        />
      )}
      {isSalesListOpen && (
        <CustomerSalesModal
          token={token}
          customerId={header.contractorId}
          customerName={customers.find((c) => c.id === header.contractorId)?.name || ""}
          onPick={(number) => { setIsSalesListOpen(false); setSaleModal({ number }); }}
          onClose={() => setIsSalesListOpen(false)}
        />
      )}
    </>
  );
}
