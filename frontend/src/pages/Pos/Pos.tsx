import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  Banknote, CheckCircle2, Clock, CreditCard, LogOut, Maximize, Minimize, Minus, PauseCircle, Percent, Plus, Printer,
  ScanLine, Search, Shirt, ShoppingBag, Trash2, User, UserPlus, Wallet, X,
} from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { localized, type LocalizedName } from "../../utils/localized";
import { printReceipt, type ReceiptData } from "./receipt";

/**
 * Kassa (POS) - alohida, to'liq ekranli oyna.
 *
 * Chap tomonda tovarlar (kategoriya va o'lcham bo'yicha filtr, qidiruv,
 * shtrix-kod skaneri), o'ng tomonda chek: soni, narxi, qator chegirmasi,
 * chek chegirmasi, mijoz. "To'lov" oynasida pul bir necha usulda va
 * valyutada qabul qilinadi, qaytim hisoblanadi; mijoz tanlangan bo'lsa
 * qarzga ham sotiladi. Chek yopilganda sotuv hujjati va pul tushumi
 * kassaga yoziladi, chek chop etiladi.
 *
 * Tugmalar: F2 - qidiruv, F8 - chekni kechiktirish, F9 - to'lov, Esc - yopish.
 */

interface Register { id: string; name: string; branchName: string | null; warehouseId: string | null; warehouseName: string | null }
interface Currency { id: string; code: string; name: string; symbol: string | null; isBase: boolean; rate: number | null }
interface Named { id: string; name: string }
interface Customer extends Named { phone: string | null }
interface Setup {
  cashRegisters: Register[]; currencies: Currency[]; paymentTypes: Named[]; customers: Customer[];
  cashier: Named | null; shopName: string | null;
}
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  categoryId: string; categoryName: LocalizedName | null; brandName: string | null;
  color: { name: LocalizedName; hex: string | null } | null; size: string | null; unit: LocalizedName | null;
  imageUrl: string | null; price: number; hasPrice: boolean; stock: number;
}
interface CartLine {
  key: string; product: Product; quantity: number; price: number; discountPercent: number;
}
interface PayLine { key: string; paymentTypeId: string; currencyId: string; amount: string; rate: string }
interface HeldReceipt { id: string; savedAt: string; customerId: string; lines: CartLine[]; discountMode: "sum" | "percent"; discountValue: string }

const REGISTER_KEY = "gulbahor.pos.register";
const HELD_KEY = "gulbahor.pos.held";
const AUTOPRINT_KEY = "gulbahor.pos.autoprint";
const storage = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* xotira yopiq */ } },
};

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const fmt = (value: number) => money.format(Math.round((value || 0) * 100) / 100);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const parse = (value: string) => Number(String(value ?? "").replace(/\s/g, "").replace(",", ".")) || 0;
const decimalOnly = (value: string) => value.replace(/[^\d.,]/g, "");
/** Donaning chegirmadan keyingi narxi - server ham xuddi shunday hisoblaydi */
const unitPrice = (line: CartLine) => round2(line.price * (1 - line.discountPercent / 100));
const lineTotal = (line: CartLine) => round2(line.quantity * unitPrice(line));
const newKey = () => Math.random().toString(36).slice(2, 10);

const QUICK_DISCOUNTS = [5, 10, 15, 20, 30, 50];

export default function Pos() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { token } = useAuth();
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [setup, setSetup] = useState<Setup | null>(null);
  const [registerId, setRegisterId] = useState(storage.get(REGISTER_KEY) || "");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [discountMode, setDiscountMode] = useState<"sum" | "percent">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [held, setHeld] = useState<HeldReceipt[]>(() => { try { return JSON.parse(storage.get(HELD_KEY) || "[]"); } catch { return []; } });

  const [modal, setModal] = useState<"" | "payment" | "customer" | "held" | "result">("");
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" | "success" } | null>(null);
  const [now, setNow] = useState(dayjs());
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [result, setResult] = useState<{ receipt: ReceiptData; change: number; debt: number; total: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const register = setup?.cashRegisters.find((item) => item.id === registerId) || null;
  const baseCurrency = setup?.currencies.find((currency) => currency.isBase) || null;
  const customer = setup?.customers.find((item) => item.id === customerId) || null;

  const notify = useCallback((text: string, tone: "info" | "error" | "success" = "info") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast((current) => (current?.text === text ? null : current)), 3500);
  }, []);
  const focusSearch = () => window.setTimeout(() => searchRef.current?.focus(), 30);

  /* ------------------------------- Yuklash ------------------------------- */

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch("/api/pos/setup", { headers: auth });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
        setSetup(data);
        // Esda qolgan kassa bo'lmasa yoki endi ochiq bo'lmasa - birinchisi
        setRegisterId((current) => (data.cashRegisters.some((item: Register) => item.id === current) ? current : data.cashRegisters[0]?.id || ""));
      } catch (err: any) {
        setLoadError(err.message);
      }
    })();
  }, [token, auth, t]);

  const loadCatalog = useCallback(async () => {
    if (!registerId) return;
    try {
      setIsCatalogLoading(true);
      const res = await fetch(`/api/pos/catalog?cashRegisterId=${registerId}`, { headers: auth });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.load_error")));
      setCatalog(data);
      setLoadError("");
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setIsCatalogLoading(false);
    }
  }, [registerId, auth, t]);

  useEffect(() => {
    if (registerId) storage.set(REGISTER_KEY, registerId);
    loadCatalog();
  }, [registerId, loadCatalog]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(dayjs()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Kechiktirilgan cheklar shu kompyuterda saqlanadi
  useEffect(() => { storage.set(HELD_KEY, JSON.stringify(held)); }, [held]);

  /* ------------------------------ To'liq ekran ------------------------------ */

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    // Alohida oynada ochilganda birinchi bosishda to'liq ekranga o'tadi
    const once = () => {
      if (window.opener && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      window.removeEventListener("pointerdown", once);
    };
    window.addEventListener("pointerdown", once);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("pointerdown", once);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => notify(t("pos.fullscreen_denied"), "error"));
  };

  const exit = () => {
    if (lines.length && !window.confirm(t("pos.exit_confirm"))) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    if (window.opener) window.close();
    else navigate("/");
  };

  /* ---------------------------------- Katalog --------------------------------- */

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of catalog) if (product.categoryId) map.set(product.categoryId, localized(product.categoryName, lang) || "—");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [catalog, lang]);

  const sizes = useMemo(() => [...new Set(catalog.map((product) => product.size).filter(Boolean) as string[])], [catalog]);

  const query = normalizeSearch(search);
  const shown = useMemo(() => catalog.filter((product) =>
    (!category || product.categoryId === category) &&
    (!size || product.size === size) &&
    (!query || normalizeSearch([product.name, product.sku, product.barcode, product.brandName, product.size, localized(product.color?.name, lang)].filter(Boolean).join(" ")).includes(query)),
  ), [catalog, category, size, query, lang]);

  /* ------------------------------------ Chek ------------------------------------ */

  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.product.id, (map.get(line.product.id) || 0) + line.quantity);
    return map;
  }, [lines]);

  const addProduct = (product: Product) => {
    const existing = lines.find((line) => line.product.id === product.id);
    if (existing) {
      setLines(lines.map((line) => (line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line)));
      setSelectedKey(existing.key);
    } else {
      const key = newKey();
      setLines([...lines, { key, product, quantity: 1, price: product.price, discountPercent: 0 }]);
      setSelectedKey(key);
    }
    if ((inCart.get(product.id) || 0) + 1 > product.stock) notify(t("pos.no_stock_warning", { name: product.name, count: product.stock }), "error");
    else if (!product.hasPrice) notify(t("pos.no_price_warning", { name: product.name }), "error");
  };

  const updateLine = (key: string, patch: Partial<CartLine>) => setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
    if (selectedKey === key) setSelectedKey("");
  };

  const clearReceipt = () => {
    setLines([]);
    setSelectedKey("");
    setCustomerId("");
    setDiscountValue("");
    setSearch("");
    focusSearch();
  };

  const subtotal = round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const lineDiscounts = round2(lines.reduce((sum, line) => sum + line.quantity * line.price, 0) - subtotal);
  const receiptDiscount = Math.min(subtotal, round2(discountMode === "percent" ? subtotal * Math.min(parse(discountValue), 100) / 100 : parse(discountValue)));
  const total = round2(subtotal - receiptDiscount);
  const itemsCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  /** Skaner: Enter - kod aniq mos kelsa yoki qidiruvda bitta tovar qolsa qo'shiladi */
  const onSearchEnter = () => {
    const code = search.trim().toLowerCase();
    if (!code) return;
    const exact = catalog.find((product) => (product.barcode || "").toLowerCase() === code || (product.sku || "").toLowerCase() === code);
    const pick = exact || (shown.length === 1 ? shown[0] : null);
    if (pick) {
      addProduct(pick);
      setSearch("");
    } else {
      notify(shown.length ? t("pos.pick_from_list") : t("documents.scan_not_found", { code: search.trim() }), "error");
    }
  };

  /* -------------------------------- Kechiktirish -------------------------------- */

  const holdReceipt = () => {
    if (!lines.length) return;
    setHeld((prev) => [{ id: newKey(), savedAt: dayjs().toISOString(), customerId, lines, discountMode, discountValue }, ...prev].slice(0, 20));
    clearReceipt();
    notify(t("pos.held_saved"), "success");
  };

  const restoreHeld = (receipt: HeldReceipt) => {
    // Hozirgi chek bo'sh bo'lmasa - u kechiktiriladi, o'rniga tanlangani ochiladi
    const current = lines.length ? [{ id: newKey(), savedAt: dayjs().toISOString(), customerId, lines, discountMode, discountValue }] : [];
    setHeld((prev) => [...current, ...prev.filter((item) => item.id !== receipt.id)]);
    setLines(receipt.lines);
    setCustomerId(receipt.customerId);
    setDiscountMode(receipt.discountMode);
    setDiscountValue(receipt.discountValue);
    setSelectedKey("");
    setModal("");
    focusSearch();
  };

  /* ---------------------------------- Tugmalar ---------------------------------- */

  const openPayment = () => {
    if (!lines.length) return notify(t("pos.empty_receipt"), "error");
    if (lines.some((line) => !(line.price > 0))) return notify(t("pos.price_required"), "error");
    if (!register?.warehouseId) return notify(t("pos.register_no_warehouse"), "error");
    setModal("payment");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") { event.preventDefault(); setModal(""); focusSearch(); }
      else if (event.key === "F9") { event.preventDefault(); if (!modal) openPayment(); }
      else if (event.key === "F8") { event.preventDefault(); if (!modal) holdReceipt(); }
      else if (event.key === "Escape" && modal && modal !== "result") { setModal(""); focusSearch(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------------------------- Sotish ---------------------------------- */

  const finishSale = async (payments: { paymentTypeId: string | null; currencyId: string; amount: number; rate?: number; label: string }[], change: number, autoPrint: boolean) => {
    if (!register) return;
    const res = await fetch("/api/pos/sales", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        cashRegisterId: register.id,
        customerId: customerId || null,
        items: lines.map((line) => ({ materialId: line.product.id, quantity: line.quantity, price: line.price, discountPercent: line.discountPercent || undefined })),
        discountAmount: receiptDiscount || undefined,
        payments: payments.map(({ label, ...payment }) => payment),
      }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(errorMessage(data, t("common.save_error")));

    const receipt: ReceiptData = {
      shopName: setup?.shopName || null,
      registerName: register.name,
      branchName: register.branchName,
      number: data.document.documentNumber,
      date: dayjs().format("DD.MM.YYYY HH:mm"),
      cashier: setup?.cashier?.name || null,
      customer: customer ? `${customer.name}${customer.phone ? ` (${customer.phone})` : ""}` : null,
      lines: lines.map((line) => ({
        name: line.product.name,
        details: [line.product.size, localized(line.product.color?.name, lang), line.product.sku].filter(Boolean).join(" · "),
        quantity: line.quantity, price: line.price, discountPercent: line.discountPercent, total: lineTotal(line),
      })),
      subtotal, discount: receiptDiscount, total: data.total,
      payments: payments.map((payment) => ({ label: payment.label, amount: fmt(payment.amount) })),
      change, debt: data.debt,
      labels: {
        receipt: t("pos.receipt"), date: t("inbounds.date"), cashier: t("pos.cashier"), customer: t("inbounds.customer"),
        subtotal: t("pos.subtotal"), discount: t("pos.discount"), total: t("pos.to_pay"), change: t("pos.change"),
        debt: t("pos.debt"), thanks: t("pos.thanks"),
      },
    };
    setResult({ receipt, change, debt: data.debt, total: data.total });
    setModal("result");
    clearReceipt();
    loadCatalog();
    if (autoPrint) printReceipt(receipt);
  };

  /* --------------------------------- Ko'rinish --------------------------------- */

  if (!setup) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100 text-sm text-gray-500 dark:bg-gray-950">
        {loadError || t("common.loading")}
      </div>
    );
  }

  if (!setup.cashRegisters.length) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-6 text-center dark:bg-gray-950">
        <Wallet className="h-12 w-12 text-gray-400" />
        <p className="max-w-md text-gray-700 dark:text-gray-300">{t("pos.no_registers")}</p>
        <button onClick={exit} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">{t("pos.exit")}</button>
      </div>
    );
  }

  const selected = lines.find((line) => line.key === selectedKey) || null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-white">
      <PageMeta title={`${t("modules.pos.title")} | Gulbahor`} description={t("modules.pos.desc")} />
      {/* ------------------------------- Yuqori panel ------------------------------- */}
      <header className="flex h-14 shrink-0 items-center gap-3 bg-gray-900 px-4 text-white">
        <span className="flex items-center gap-2 font-semibold">
          <ShoppingBag className="h-5 w-5 text-brand-400" />
          <span className="hidden sm:inline">{setup.shopName || "Gulbahor"}</span>
          <span className="rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">POS</span>
        </span>
        <select
          aria-label={t("cash.register")} value={registerId}
          onChange={(e) => { if (!lines.length || window.confirm(t("pos.switch_register_confirm"))) { setRegisterId(e.target.value); clearReceipt(); } }}
          className="h-9 rounded-lg border border-white/10 bg-white/10 px-2 text-sm text-white focus:outline-none [&>option]:text-gray-900"
        >
          {setup.cashRegisters.map((item) => (
            <option key={item.id} value={item.id}>{item.name}{item.branchName ? ` · ${item.branchName}` : ""}</option>
          ))}
        </select>
        {register && !register.warehouseId && <span className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-200">{t("pos.register_no_warehouse")}</span>}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button
            onClick={() => setModal("held")}
            className="relative flex h-9 items-center gap-1.5 rounded-lg px-3 text-white/80 hover:bg-white/10"
            title={t("pos.held_title")}
          >
            <PauseCircle className="h-4 w-4" />
            <span className="hidden md:inline">{t("pos.held_title")}</span>
            {held.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold">{held.length}</span>}
          </button>
          <span className="hidden items-center gap-1.5 text-white/70 lg:flex"><User className="h-4 w-4" />{setup.cashier?.name}</span>
          <span className="hidden items-center gap-1.5 tabular-nums text-white/70 md:flex"><Clock className="h-4 w-4" />{now.format("DD.MM HH:mm")}</span>
          <button onClick={toggleFullscreen} title={t("pos.fullscreen")} aria-label={t("pos.fullscreen")} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
          <button onClick={exit} title={t("pos.exit")} aria-label={t("pos.exit")} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-red-500/80">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* --------------------------------- Tovarlar --------------------------------- */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-2 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef} autoFocus type="text" value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSearchEnter(); } }}
                placeholder={t("pos.search_placeholder")}
                className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-11 pr-24 text-base focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-200 px-1.5 text-xs text-gray-400 dark:border-gray-700">F2</span>
            </div>
            {categories.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                <Chip active={!category} onClick={() => setCategory("")}>{t("pos.all")}</Chip>
                {categories.map(([id, name]) => <Chip key={id} active={category === id} onClick={() => setCategory(category === id ? "" : id)}>{name}</Chip>)}
              </div>
            )}
            {sizes.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="shrink-0 text-xs text-gray-500">{t("materials.size")}:</span>
                {sizes.map((value) => (
                  <button
                    key={value} onClick={() => setSize(size === value ? "" : value)}
                    className={`h-7 min-w-9 shrink-0 rounded-md border px-2 text-xs font-semibold ${size === value ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loadError ? (
              <p className="p-6 text-center text-sm text-red-500">{loadError}</p>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">{isCatalogLoading ? t("common.loading") : t("common.nothing_found")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {shown.map((product) => {
                  const count = inCart.get(product.id) || 0;
                  const left = product.stock - count;
                  return (
                    <button
                      key={product.id} onClick={() => { addProduct(product); focusSearch(); }}
                      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900 ${count ? "border-brand-400 ring-2 ring-brand-500/20" : "border-gray-200 dark:border-gray-800"}`}
                    >
                      <span className="relative block aspect-square w-full bg-gray-100 dark:bg-gray-800">
                        {product.imageUrl
                          ? <img src={product.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <span className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600"><Shirt className="h-10 w-10" /></span>}
                        <span className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${left > 0 ? "bg-white/90 text-gray-700 dark:bg-gray-900/90 dark:text-gray-200" : "bg-red-500 text-white"}`}>
                          {left > 0 ? t("pos.left_count", { count: left }) : t("pos.out_of_stock")}
                        </span>
                        {count > 0 && <span className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-white">{count}</span>}
                      </span>
                      <span className="flex flex-1 flex-col gap-1 p-2.5">
                        <span className="line-clamp-2 text-sm font-medium leading-tight">{product.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                          {product.size && <span className="rounded border border-gray-200 px-1 font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300">{product.size}</span>}
                          {product.color && (
                            <span className="flex items-center gap-1 truncate">
                              <span className="h-3 w-3 shrink-0 rounded-full border border-gray-300" style={{ background: product.color.hex || "transparent" }} />
                              {localized(product.color.name, lang)}
                            </span>
                          )}
                        </span>
                        <span className={`mt-auto text-base font-bold tabular-nums ${product.hasPrice ? "" : "text-amber-600"}`}>
                          {product.hasPrice ? `${fmt(product.price)}` : t("pos.no_price")}
                          {product.hasPrice && <span className="ml-1 text-xs font-normal text-gray-400">{t("currencies.sum")}</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ----------------------------------- Chek ----------------------------------- */}
        <aside className="flex w-[400px] shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:w-[440px]">
          <button
            onClick={() => setModal("customer")}
            className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${customer ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>
              {customer ? <User className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{customer ? customer.name : t("pos.walk_in")}</span>
              <span className="block text-xs text-gray-500">{customer ? customer.phone || "—" : t("pos.pick_customer")}</span>
            </span>
            {customer && (
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setCustomerId(""); }} className="rounded p-1 text-gray-400 hover:text-red-500">
                <X className="h-4 w-4" />
              </span>
            )}
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-gray-400">
                <ScanLine className="h-12 w-12" />
                <p className="text-sm">{t("pos.empty_hint")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {lines.map((line) => {
                  const isSelected = line.key === selectedKey;
                  return (
                    <li key={line.key} className={isSelected ? "bg-brand-50/60 dark:bg-brand-500/10" : ""}>
                      <div className="flex cursor-pointer gap-3 px-4 py-2.5" onClick={() => setSelectedKey(isSelected ? "" : line.key)}>
                        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                          {line.product.imageUrl
                            ? <img src={line.product.imageUrl} alt="" className="h-full w-full object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-gray-300"><Shirt className="h-5 w-5" /></span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{line.product.name}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {[line.product.size, localized(line.product.color?.name, lang), line.product.sku].filter(Boolean).join(" · ")}
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            <span className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
                              <button
                                aria-label={t("pos.minus")}
                                onClick={() => (line.quantity <= 1 ? removeLine(line.key) : updateLine(line.key, { quantity: line.quantity - 1 }))}
                                className="flex h-7 w-7 items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-7 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
                              <button aria-label={t("pos.plus")} onClick={() => updateLine(line.key, { quantity: line.quantity + 1 })} className="flex h-7 w-7 items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white">
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </span>
                            <span className="text-xs text-gray-500 tabular-nums">× {fmt(line.price)}</span>
                            {line.discountPercent > 0 && <span className="rounded bg-red-50 px-1 text-xs font-semibold text-red-600 dark:bg-red-500/10">−{line.discountPercent}%</span>}
                          </span>
                        </span>
                        <span className="flex flex-col items-end justify-between">
                          <span className="text-sm font-bold tabular-nums">{fmt(lineTotal(line))}</span>
                          <button aria-label={t("common.delete")} onClick={(e) => { e.stopPropagation(); removeLine(line.key); }} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      </div>

                      {/* Tanlangan qator: narx va chegirma */}
                      {isSelected && selected && (
                        <div className="grid grid-cols-2 gap-2 px-4 pb-3">
                          <label className="text-xs text-gray-500">
                            {t("inbounds.price")}
                            <input
                              type="text" inputMode="decimal" value={String(line.price)}
                              onChange={(e) => updateLine(line.key, { price: parse(decimalOnly(e.target.value)) })}
                              onFocus={(e) => e.target.select()}
                              className="mt-0.5 h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-right text-sm font-semibold text-gray-900 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            />
                          </label>
                          <label className="text-xs text-gray-500">
                            {t("pos.line_discount")}
                            <input
                              type="text" inputMode="decimal" value={line.discountPercent ? String(line.discountPercent) : ""} placeholder="0"
                              onChange={(e) => updateLine(line.key, { discountPercent: Math.min(100, parse(decimalOnly(e.target.value))) })}
                              onFocus={(e) => e.target.select()}
                              className="mt-0.5 h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-right text-sm font-semibold text-gray-900 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            />
                          </label>
                          <div className="col-span-2 flex flex-wrap gap-1">
                            {QUICK_DISCOUNTS.map((value) => (
                              <button
                                key={value} onClick={() => updateLine(line.key, { discountPercent: line.discountPercent === value ? 0 : value })}
                                className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${line.discountPercent === value ? "border-red-500 bg-red-500 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"}`}
                              >
                                −{value}%
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Jamilar */}
          <div className="space-y-2 border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-800">
            <div className="flex justify-between text-gray-500"><span>{t("pos.items_count", { count: itemsCount })}</span><span className="tabular-nums">{fmt(subtotal + lineDiscounts)}</span></div>
            {lineDiscounts > 0 && <div className="flex justify-between text-red-600"><span>{t("pos.line_discounts")}</span><span className="tabular-nums">−{fmt(lineDiscounts)}</span></div>}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-gray-500"><Percent className="h-3.5 w-3.5" />{t("pos.discount")}</span>
              <span className="ml-auto inline-flex rounded-md border border-gray-200 p-0.5 dark:border-gray-700">
                {(["percent", "sum"] as const).map((mode) => (
                  <button key={mode} onClick={() => setDiscountMode(mode)} className={`rounded px-2 text-xs font-semibold ${discountMode === mode ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500"}`}>
                    {mode === "percent" ? "%" : t("currencies.sum")}
                  </button>
                ))}
              </span>
              <input
                type="text" inputMode="decimal" value={discountValue} placeholder="0" aria-label={t("pos.discount")}
                onChange={(e) => setDiscountValue(decimalOnly(e.target.value))}
                className="h-8 w-24 rounded-lg border border-gray-300 bg-white px-2 text-right text-sm focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            {receiptDiscount > 0 && <div className="flex justify-between text-red-600"><span>{t("pos.receipt_discount")}</span><span className="tabular-nums">−{fmt(receiptDiscount)}</span></div>}
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-base font-semibold">{t("pos.to_pay")}</span>
              <span className="text-2xl font-bold tabular-nums">{fmt(total)} <span className="text-sm font-normal text-gray-400">{t("currencies.sum")}</span></span>
            </div>
          </div>

          <div className="grid grid-cols-[auto_auto_1fr] gap-2 border-t border-gray-200 p-3 dark:border-gray-800">
            <button
              onClick={() => { if (window.confirm(t("pos.clear_confirm"))) clearReceipt(); }} disabled={!lines.length}
              title={t("pos.clear")} aria-label={t("pos.clear")}
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 disabled:opacity-40 dark:border-gray-700"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <button
              onClick={holdReceipt} disabled={!lines.length} title={`${t("pos.hold")} (F8)`} aria-label={t("pos.hold")}
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600 disabled:opacity-40 dark:border-gray-700"
            >
              <PauseCircle className="h-5 w-5" />
            </button>
            <button
              onClick={openPayment} disabled={!lines.length}
              className="flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-500 text-lg font-bold text-white shadow-sm hover:bg-brand-600 disabled:opacity-40"
            >
              <Wallet className="h-5 w-5" />
              {t("pos.pay")} <span className="rounded bg-white/20 px-1.5 text-xs">F9</span>
            </button>
          </div>
        </aside>
      </div>

      {/* ---------------------------------- Oynalar ---------------------------------- */}
      {modal === "customer" && (
        <CustomerModal
          customers={setup.customers}
          selectedId={customerId}
          auth={auth}
          onPick={(id) => { setCustomerId(id); setModal(""); focusSearch(); }}
          onCreated={(created, existing) => {
            // Yangi mijoz ro'yxatga qo'shiladi va darhol chekka tanlanadi
            if (!setup.customers.some((item) => item.id === created.id)) {
              setSetup({ ...setup, customers: [...setup.customers, created].sort((a, b) => a.name.localeCompare(b.name)) });
            }
            setCustomerId(created.id);
            setModal("");
            notify(existing ? t("pos.customer_exists", { name: created.name }) : t("pos.customer_added", { name: created.name }), existing ? "info" : "success");
            focusSearch();
          }}
          onClose={() => { setModal(""); focusSearch(); }}
        />
      )}

      {modal === "held" && (
        <Modal title={t("pos.held_title")} onClose={() => { setModal(""); focusSearch(); }}>
          {held.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">{t("pos.held_empty")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {held.map((receipt) => {
                const sum = receipt.lines.reduce((acc, line) => acc + lineTotal(line), 0);
                const who = setup.customers.find((item) => item.id === receipt.customerId);
                return (
                  <li key={receipt.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{who?.name || t("pos.walk_in")} · {fmt(sum)} {t("currencies.sum")}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {dayjs(receipt.savedAt).format("DD.MM HH:mm")} · {receipt.lines.map((line) => `${line.product.name} ×${line.quantity}`).join(", ")}
                      </span>
                    </span>
                    <button onClick={() => restoreHeld(receipt)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white">{t("pos.restore")}</button>
                    <button onClick={() => setHeld((prev) => prev.filter((item) => item.id !== receipt.id))} aria-label={t("common.delete")} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      )}

      {modal === "payment" && baseCurrency && (
        <PaymentModal
          total={total}
          currencies={setup.currencies}
          paymentTypes={setup.paymentTypes}
          baseCurrency={baseCurrency}
          hasCustomer={!!customer}
          onClose={() => { setModal(""); focusSearch(); }}
          onFinish={finishSale}
        />
      )}

      {modal === "result" && result && (
        <Modal title="" onClose={() => { setModal(""); focusSearch(); }} hideHeader>
          <div className="px-6 py-8 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            <p className="mt-3 text-lg font-semibold">{t("pos.sold_title", { number: result.receipt.number })}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{fmt(result.total)} <span className="text-base font-normal text-gray-400">{t("currencies.sum")}</span></p>
            {result.change > 0 && (
              <p className="mx-auto mt-4 max-w-xs rounded-xl bg-green-50 px-4 py-3 text-green-700 dark:bg-green-500/10 dark:text-green-300">
                {t("pos.change")}: <b className="text-2xl tabular-nums">{fmt(result.change)}</b> {t("currencies.sum")}
              </p>
            )}
            {result.debt > 0 && (
              <p className="mx-auto mt-4 max-w-xs rounded-xl bg-amber-50 px-4 py-3 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {t("pos.debt")}: <b className="text-xl tabular-nums">{fmt(result.debt)}</b> {t("currencies.sum")}
              </p>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => printReceipt(result.receipt)} className="flex h-12 items-center gap-2 rounded-xl border border-gray-300 px-5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5">
                <Printer className="h-5 w-5" /> {t("pos.print")}
              </button>
              <button autoFocus onClick={() => { setModal(""); focusSearch(); }} className="flex h-12 items-center gap-2 rounded-xl bg-brand-500 px-6 font-semibold text-white hover:bg-brand-600">
                {t("pos.new_sale")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Xabar */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-6 z-[100001] max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.tone === "error" ? "bg-red-600 text-white" : toast.tone === "success" ? "bg-green-600 text-white" : "bg-gray-900 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ================================ Yordamchilar ================================ */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition ${active ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"}`}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children, wide, hideHeader }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; hideHeader?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-900 dark:text-white ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="text-lg font-bold">{title}</h3>
            <button onClick={onClose} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** "+998 90 123 45 67" ko'rinishida: faqat raqamlar, 12 tagacha, bo'shliqlar bilan */
function formatPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (!digits.startsWith("998")) digits = `998${digits.replace(/^998/, "")}`;
  digits = digits.slice(0, 12);
  const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 8), digits.slice(8, 10), digits.slice(10, 12)].filter(Boolean);
  return `+${parts.join(" ")}`;
}

function CustomerModal({ customers, selectedId, auth, onPick, onCreated, onClose }: {
  customers: Customer[]; selectedId: string; auth: Record<string, string>;
  onPick: (id: string) => void;
  onCreated: (customer: Customer, existing: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "+998 ", birthDate: "" });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const q = normalizeSearch(query);
  const digits = query.replace(/\D/g, "");
  const shown = customers.filter((item) =>
    !q || normalizeSearch(item.name).includes(q) || (digits.length >= 3 && (item.phone || "").replace(/\D/g, "").includes(digits))).slice(0, 100);

  /** Qidiruvda yozilgani formaga o'tadi: raqam bo'lsa - telefonga, matn bo'lsa - F.I.O ga */
  const openNew = () => {
    const isPhone = digits.length >= 3 && digits.length >= query.replace(/\s/g, "").length - 1;
    setForm({ name: isPhone ? "" : query.trim(), phone: isPhone ? formatPhone(digits) : "+998 ", birthDate: "" });
    setError("");
    setIsNew(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return setError(t("ref.required_field", { field: t("pos.full_name") }));
    if (form.phone.replace(/\D/g, "").length !== 12) return setError(t("pos.phone_invalid"));
    if (!form.birthDate) return setError(t("ref.required_field", { field: t("contractors.birth_date") }));
    try {
      setIsSaving(true);
      setError("");
      const res = await fetch("/api/pos/customers", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: form.phone.replace(/\s/g, ""), birthDate: form.birthDate }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(data, t("common.save_error")));
      onCreated({ id: data.id, name: data.name, phone: data.phone }, !!data.existing);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass = "h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-brand-400 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800";

  if (isNew) {
    return (
      <Modal title={t("pos.new_customer")} onClose={onClose}>
        <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="block text-sm font-medium">
            {t("pos.full_name")} <span className="text-red-500">*</span>
            <input
              autoFocus={!form.name} name="name" type="text" maxLength={160} value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }}
              placeholder={t("pos.full_name_placeholder")}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("profile.phone")} <span className="text-red-500">*</span>
            <input
              autoFocus={!!form.name} name="phone" type="tel" inputMode="tel" value={form.phone}
              onChange={(e) => { setForm({ ...form, phone: formatPhone(e.target.value) }); setError(""); }}
              className={`mt-1 ${fieldClass} font-mono tracking-wide`}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("contractors.birth_date")} <span className="text-red-500">*</span>
            <input
              name="birthDate" type="date" value={form.birthDate} max={dayjs().format("YYYY-MM-DD")}
              onChange={(e) => { setForm({ ...form, birthDate: e.target.value }); setError(""); }}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setIsNew(false)} className="h-11 rounded-xl border border-gray-300 px-4 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5">
              {t("inbounds.back")}
            </button>
            <button type="submit" disabled={isSaving} className="flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              <UserPlus className="h-4 w-4" /> {isSaving ? t("common.saving") : t("pos.add_and_pick")}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={t("pos.pick_customer")} onClose={onClose}>
      <div className="border-b border-gray-200 p-4 dark:border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("pos.customer_search")}
            onKeyDown={(e) => { if (e.key === "Enter" && shown.length === 1) onPick(shown[0].id); }}
            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
        <button
          onClick={openNew}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/10"
        >
          <UserPlus className="h-4 w-4" /> {t("pos.new_customer")}
        </button>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        <li>
          <button onClick={() => onPick("")} className={`flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5 ${!selectedId ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}>
            <User className="h-4 w-4 text-gray-400" /><span className="text-sm font-medium">{t("pos.walk_in")}</span>
          </button>
        </li>
        {shown.map((item) => (
          <li key={item.id}>
            <button onClick={() => onPick(item.id)} className={`flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5 ${selectedId === item.id ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{item.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block text-xs text-gray-500">{item.phone || "—"}</span>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">
            {t("common.nothing_found")}
            {query.trim() && <button onClick={openNew} className="mt-2 block w-full text-brand-600 hover:underline dark:text-brand-400">{t("pos.add_as_new", { value: query.trim() })}</button>}
          </li>
        )}
      </ul>
    </Modal>
  );
}

/** To'lov: bir nechta usul va valyuta, qaytim va qarz */
function PaymentModal({ total, currencies, paymentTypes, baseCurrency, hasCustomer, onClose, onFinish }: {
  total: number; currencies: Currency[]; paymentTypes: Named[]; baseCurrency: Currency; hasCustomer: boolean;
  onClose: () => void;
  onFinish: (payments: { paymentTypeId: string | null; currencyId: string; amount: number; rate?: number; label: string }[], change: number, autoPrint: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const firstType = paymentTypes[0]?.id || "";
  const [pays, setPays] = useState<PayLine[]>([{ key: newKey(), paymentTypeId: firstType, currencyId: baseCurrency.id, amount: String(total), rate: "" }]);
  const [autoPrint, setAutoPrint] = useState(storage.get(AUTOPRINT_KEY) !== "0");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const currencyOf = (id: string) => currencies.find((item) => item.id === id) || baseCurrency;
  const uzsOf = (pay: PayLine) => {
    const currency = currencyOf(pay.currencyId);
    return round2(parse(pay.amount) * (currency.isBase ? 1 : parse(pay.rate)));
  };
  const paid = round2(pays.reduce((sum, pay) => sum + uzsOf(pay), 0));
  const remaining = round2(total - paid);
  const change = remaining < 0 ? -remaining : 0;

  const update = (key: string, patch: Partial<PayLine>) => { setPays((prev) => prev.map((pay) => (pay.key === key ? { ...pay, ...patch } : pay))); setError(""); };

  const setCurrency = (pay: PayLine, currencyId: string) => {
    const currency = currencyOf(currencyId);
    const rate = currency.isBase ? "" : String(currency.rate || "");
    // Valyuta almashsa - qolgan qarz shu valyutaga o'girib taklif qilinadi
    const others = round2(pays.filter((item) => item.key !== pay.key).reduce((sum, item) => sum + uzsOf(item), 0));
    const due = Math.max(0, total - others);
    const amount = currency.isBase ? String(due) : parse(rate) > 0 ? String(Math.ceil((due / parse(rate)) * 100) / 100) : "";
    update(pay.key, { currencyId, rate, amount });
  };

  const addLine = () => {
    const otherType = paymentTypes.find((type) => !pays.some((pay) => pay.paymentTypeId === type.id))?.id || firstType;
    setPays([...pays, { key: newKey(), paymentTypeId: otherType, currencyId: baseCurrency.id, amount: remaining > 0 ? String(remaining) : "", rate: "" }]);
  };

  /** Naqd pul uchun tez summalar: yaxlitlangan banknotlar */
  const quickAmounts = (pay: PayLine) => {
    const others = round2(pays.filter((item) => item.key !== pay.key).reduce((sum, item) => sum + uzsOf(item), 0));
    const due = Math.max(0, total - others);
    const set = new Set<number>([due]);
    for (const step of [1000, 5000, 10000, 50000, 100000]) set.add(Math.ceil(due / step) * step);
    return [...set].filter((value) => value > 0).sort((a, b) => a - b).slice(0, 5);
  };

  const submit = async () => {
    const valid = pays.filter((pay) => parse(pay.amount) > 0);
    for (const pay of valid) {
      const currency = currencyOf(pay.currencyId);
      if (!currency.isBase && !(parse(pay.rate) > 0)) return setError(t("pos.rate_required", { code: currency.code }));
    }
    if (remaining > 0.5 && !hasCustomer) return setError(t("pos.debt_needs_customer"));

    // Qaytim so'mda beriladi: ortiqcha pul oxirgi so'mdagi to'lovlardan ayiriladi
    let rest = change;
    const lines = valid.map((pay) => ({ ...pay, value: parse(pay.amount) }));
    for (let i = lines.length - 1; i >= 0 && rest > 0.004; i--) {
      if (!currencyOf(lines[i].currencyId).isBase) continue;
      const take = Math.min(rest, lines[i].value);
      lines[i].value = round2(lines[i].value - take);
      rest = round2(rest - take);
    }
    if (rest > 0.004) return setError(t("pos.change_in_currency"));

    const payments = lines.filter((line) => line.value > 0).map((line) => {
      const currency = currencyOf(line.currencyId);
      const type = paymentTypes.find((item) => item.id === line.paymentTypeId);
      return {
        paymentTypeId: line.paymentTypeId || null,
        currencyId: line.currencyId,
        amount: line.value,
        ...(currency.isBase ? {} : { rate: parse(line.rate) }),
        label: `${type?.name || t("cash.no_payment_type")}${currency.isBase ? "" : ` (${currency.code})`}`,
      };
    });

    try {
      setIsBusy(true);
      setError("");
      storage.set(AUTOPRINT_KEY, autoPrint ? "1" : "0");
      await onFinish(payments, change, autoPrint);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const typeIcon = (name: string) => (/karta|card|uzcard|humo|visa/i.test(name) ? <CreditCard className="h-4 w-4" /> : <Banknote className="h-4 w-4" />);

  return (
    <Modal title={t("pos.payment_title")} onClose={onClose} wide>
      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between rounded-xl bg-gray-900 px-5 py-4 text-white">
          <span className="text-sm text-white/70">{t("pos.to_pay")}</span>
          <span className="text-3xl font-bold tabular-nums">{fmt(total)} <span className="text-base font-normal text-white/60">{baseCurrency.code}</span></span>
        </div>

        {pays.map((pay) => {
          const currency = currencyOf(pay.currencyId);
          return (
            <div key={pay.key} className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-1.5">
                {paymentTypes.map((type) => (
                  <button
                    key={type.id} onClick={() => update(pay.key, { paymentTypeId: type.id })}
                    className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${pay.paymentTypeId === type.id ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"}`}
                  >
                    {typeIcon(type.name)}{type.name}
                  </button>
                ))}
                {pays.length > 1 && (
                  <button onClick={() => setPays(pays.filter((item) => item.key !== pay.key))} aria-label={t("common.delete")} className="ml-auto text-gray-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  aria-label={t("inbounds.currency")} value={pay.currencyId} onChange={(e) => setCurrency(pay, e.target.value)}
                  className="h-12 rounded-lg border border-gray-300 bg-white px-2 text-sm font-semibold dark:border-gray-700 dark:bg-gray-800"
                >
                  {currencies.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
                </select>
                <input
                  type="text" inputMode="decimal" value={pay.amount} autoFocus={pays.length === 1}
                  onChange={(e) => update(pay.key, { amount: decimalOnly(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  aria-label={t("inbounds.amount")}
                  className="h-12 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-right text-xl font-bold tabular-nums focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
                />
                {!currency.isBase && (
                  <input
                    type="text" inputMode="decimal" value={pay.rate} placeholder={t("payments.rate")}
                    onChange={(e) => update(pay.key, { rate: decimalOnly(e.target.value) })}
                    aria-label={t("payments.rate")} title={t("payments.rate")}
                    className="h-12 w-28 rounded-lg border border-gray-300 bg-white px-2 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
                  />
                )}
              </div>
              {currency.isBase ? (
                <div className="flex flex-wrap gap-1.5">
                  {quickAmounts(pay).map((value) => (
                    <button key={value} onClick={() => update(pay.key, { amount: String(value) })} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
                      {fmt(value)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">≈ {fmt(uzsOf(pay))} {baseCurrency.code}</p>
              )}
            </div>
          );
        })}

        {paymentTypes.length > 0 && (
          <button onClick={addLine} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300">
            <Plus className="h-4 w-4" /> {t("pos.split_payment")}
          </button>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <span className="block text-xs text-gray-500">{t("pos.paid")}</span>
            <span className="text-lg font-bold tabular-nums">{fmt(paid)}</span>
          </div>
          {change > 0 ? (
            <div className="rounded-xl bg-green-50 px-4 py-3 text-green-700 dark:bg-green-500/10 dark:text-green-300">
              <span className="block text-xs">{t("pos.change")}</span>
              <span className="text-lg font-bold tabular-nums">{fmt(change)}</span>
            </div>
          ) : (
            <div className={`rounded-xl px-4 py-3 ${remaining > 0.5 ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : "bg-gray-50 dark:bg-gray-800"}`}>
              <span className="block text-xs">{remaining > 0.5 ? t("pos.debt") : t("pos.remaining")}</span>
              <span className="text-lg font-bold tabular-nums">{fmt(Math.max(0, remaining))}</span>
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500" />
            <Printer className="h-4 w-4" /> {t("pos.auto_print")}
          </label>
          <button
            onClick={submit} disabled={isBusy}
            className="flex h-14 min-w-48 items-center justify-center gap-2 rounded-xl bg-green-600 px-6 text-lg font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-5 w-5" /> {isBusy ? t("common.saving") : t("pos.finish")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
