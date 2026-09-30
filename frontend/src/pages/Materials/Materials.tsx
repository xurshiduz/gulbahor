import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit, ImageOff, ImagePlus, Plus, Search, Star, Trash2, X } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Pagination, { DEFAULT_PAGE_SIZE } from "../../components/common/Pagination";
import Button from "../../components/ui/button/Button";
import { ActiveBadge, useReferenceList } from "../../components/reference/ReferenceCrud";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { normalizeSearch } from "../../config/modules";
import { localized, type LocalizedName } from "../../utils/localized";

/**
 * Materiallar (tovarlar).
 *
 * Xususiyatlar ma'lumotnomalardan tanlanadi (kategoriya, brend, birlik,
 * rang, o'lcham, davlat). Rasmlar bir nechta bo'ladi, bittasi asosiy -
 * ro'yxatda shu ko'rinadi. Soliq bo'limida MXIK, o'ram kodi, TN VED,
 * QQS stavkasi va markirovka belgisi kiritiladi.
 */

interface Named { id: string; name: LocalizedName }
interface Category extends Named { parentId: string | null }
interface Brand { id: string; name: string }
interface Unit extends Named { shortName: LocalizedName }
interface ColorRef extends Named { hex: string | null }
interface SizeRef { id: string; name: string; scale: string | null }
interface MaterialImage { id: string; url: string; isMain: boolean }

interface Material {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string;
  category: Category | null;
  brandId: string | null;
  brand: Brand | null;
  unitId: string;
  unit: Unit | null;
  colorId: string | null;
  color: ColorRef | null;
  sizeId: string | null;
  size: SizeRef | null;
  countryId: string | null;
  country: Named | null;
  description: string | null;
  mxikCode: string | null;
  packageCode: string | null;
  tnvedCode: string | null;
  vatRate: number | null;
  salePrice: number | null;
  isMarked: boolean;
  isActive: boolean;
  images: MaterialImage[];
}

/** Formadagi rasm: bazada bor (saved) yoki hali yuklanmagan, tanlangan fayl (new) */
type FormImage =
  | { key: string; kind: "saved"; id: string; url: string }
  | { key: string; kind: "new"; file: File; url: string };

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// QQS stavkalari: bo'sh - QQSsiz
const VAT_RATES = ["0", "12"];

const BLANK = {
  name: "", sku: "", barcode: "", categoryId: "", unitId: "", brandId: "", colorId: "", sizeId: "", countryId: "",
  description: "", mxikCode: "", packageCode: "", tnvedCode: "", vatRate: "", salePrice: "", isMarked: false, isActive: true,
};
type Form = typeof BLANK;

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";
const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap";
const td = "px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300";

const mainImage = (material: Material) => material.images.find((image) => image.isMain) || material.images[0];

function Field({ label, required, hint, half, children }: {
  label: string; required?: boolean; hint?: string; half?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={half ? "col-span-6 sm:col-span-3" : "col-span-6"}>
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="col-span-6 border-b border-gray-200 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800">
      {children}
    </h4>
  );
}

export default function Materials() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { token, logout } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const mayCreate = canCreate("materials");
  const mayUpdate = canUpdate("materials");
  const mayDelete = canDelete("materials");
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // Ma'lumotnomalar - forma va filtr uchun
  const categories = useReferenceList<Category>("/api/product-categories");
  const brands = useReferenceList<Brand>("/api/product-brands");
  const units = useReferenceList<Unit>("/api/product-units");
  const colors = useReferenceList<ColorRef>("/api/colors");
  const sizes = useReferenceList<SizeRef>("/api/sizes");
  const countries = useReferenceList<Named>("/api/countries");

  /** Kategoriyalar to'liq yo'li bilan: "Erkaklar kiyimi / Shimlar" */
  const categoryOptions = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const path = (c: Category): string => {
      const parent = c.parentId ? byId.get(c.parentId) : null;
      return parent ? `${path(parent)} / ${localized(c.name, lang)}` : localized(c.name, lang);
    };
    return categories.map((c) => ({ value: c.id, label: path(c) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [categories, lang]);
  const categoryLabel = useMemo(() => new Map(categoryOptions.map((o) => [o.value, o.label])), [categoryOptions]);

  const [rows, setRows] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [images, setImages] = useState<FormImage[]>([]);
  const [mainKey, setMainKey] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const res = await fetch("/api/materials", { headers: auth });
      if (res.status === 401) return logout();
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.load_error")));
      setRows(await res.json());
    } catch (err: any) {
      setLoadError(err.message || t("common.load_error"));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  /* ---------------------------------- Ro'yxat ---------------------------------- */

  const query = normalizeSearch(search);
  const filtered = useMemo(() => {
    // Kategoriya tanlansa uning ost kategoriyalaridagi materiallar ham chiqadi
    const allowed = new Set<string>();
    if (categoryFilter) {
      allowed.add(categoryFilter);
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of categories) {
          if (c.parentId && allowed.has(c.parentId) && !allowed.has(c.id)) { allowed.add(c.id); grew = true; }
        }
      }
    }
    return rows.filter((row) =>
      (!categoryFilter || allowed.has(row.categoryId)) &&
      (!query || normalizeSearch([row.name, row.sku, row.barcode, row.mxikCode, row.brand?.name].filter(Boolean).join(" ")).includes(query)),
    );
  }, [rows, query, categoryFilter, categories]);

  useEffect(() => { setPage(1); }, [query, categoryFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /* ----------------------------------- Forma ----------------------------------- */

  /** Tanlangan, hali yuklanmagan fayllar uchun yaratilgan vaqtinchalik manzillarni bo'shatadi */
  const releasePreviews = (list: FormImage[]) =>
    list.forEach((image) => { if (image.kind === "new") URL.revokeObjectURL(image.url); });

  const openForm = (row?: Material) => {
    setEditing(row || null);
    setForm(row ? {
      name: row.name, sku: row.sku || "", barcode: row.barcode || "",
      categoryId: row.categoryId, unitId: row.unitId, brandId: row.brandId || "", colorId: row.colorId || "",
      sizeId: row.sizeId || "", countryId: row.countryId || "", description: row.description || "",
      mxikCode: row.mxikCode || "", packageCode: row.packageCode || "", tnvedCode: row.tnvedCode || "",
      vatRate: row.vatRate === null ? "" : String(row.vatRate), isMarked: row.isMarked, isActive: row.isActive,
      salePrice: row.salePrice === null || row.salePrice === undefined ? "" : String(row.salePrice),
    } : BLANK);
    const saved: FormImage[] = (row?.images || []).map((image) => ({ key: image.id, kind: "saved", id: image.id, url: image.url }));
    setImages(saved);
    setMainKey(row ? mainImage(row)?.id || "" : "");
    setFormError("");
    setIsOpen(true);
  };

  const closeForm = () => {
    releasePreviews(images);
    setIsOpen(false);
  };

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError("");
  };
  const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

  const pickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = ""; // o'sha faylni qayta tanlash mumkin bo'lsin
    const room = MAX_IMAGES - images.length;
    const accepted: FormImage[] = [];
    let problem = "";

    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) { problem = t("materials.image_type_error"); continue; }
      if (file.size > MAX_IMAGE_SIZE) { problem = t("materials.image_size_error"); continue; }
      if (accepted.length >= room) { problem = t("materials.image_limit_error", { count: MAX_IMAGES }); break; }
      accepted.push({ key: `new-${Date.now()}-${accepted.length}-${file.name}`, kind: "new", file, url: URL.createObjectURL(file) });
    }

    setFormError(problem);
    if (!accepted.length) return;
    setImages((prev) => [...prev, ...accepted]);
    // Birinchi qo'shilgan rasm o'zi asosiy bo'ladi
    if (!mainKey) setMainKey(accepted[0].key);
  };

  const dropImage = (image: FormImage) => {
    if (image.kind === "new") URL.revokeObjectURL(image.url);
    const rest = images.filter((item) => item.key !== image.key);
    setImages(rest);
    if (mainKey === image.key) setMainKey(rest[0]?.key || "");
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return setFormError(t("ref.required_field", { field: t("ref.name") }));
    if (!form.categoryId) return setFormError(t("ref.required_field", { field: t("materials.category") }));
    if (!form.unitId) return setFormError(t("ref.required_field", { field: t("materials.unit") }));
    if (form.mxikCode && form.mxikCode.length !== 17) return setFormError(t("materials.mxik_error"));
    if (form.tnvedCode && form.tnvedCode.length !== 10) return setFormError(t("materials.tnved_error"));

    const payload = {
      ...form,
      name,
      // Tanlanmagan selectlar - null (bog'lanishni olib tashlash)
      brandId: form.brandId || null,
      colorId: form.colorId || null,
      sizeId: form.sizeId || null,
      countryId: form.countryId || null,
      vatRate: form.vatRate === "" ? null : Number(form.vatRate),
      salePrice: form.salePrice === "" ? null : Number(String(form.salePrice).replace(/\s/g, "").replace(",", ".")),
    };

    const request = async (url: string, init: RequestInit) => {
      const res = await fetch(url, init);
      const body = await readJson(res);
      if (!res.ok) throw new Error(errorMessage(body, t("common.save_error")));
      return body;
    };

    try {
      setIsSaving(true);
      setFormError("");
      const saved: Material = await request(editing ? `/api/materials/${editing.id}` : "/api/materials", {
        method: editing ? "PUT" : "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Rasm bosqichida xato chiqib "Saqlash" qayta bosilsa, material ikkinchi marta yaratilmasin
      setEditing({ ...saved, images: editing?.images || [] });
      const base = `/api/materials/${saved.id}/images`;

      // 1) Formadan olib tashlangan eski rasmlar o'chiriladi
      const kept = new Set(images.filter((image) => image.kind === "saved").map((image) => image.key));
      for (const image of editing?.images || []) {
        if (!kept.has(image.id)) await request(`${base}/${image.id}`, { method: "DELETE", headers: auth });
      }

      // 2) Yangi fayllar yuklanadi; server ularni yuklangan tartibda qaytaradi
      const fresh = images.filter((image): image is Extract<FormImage, { kind: "new" }> => image.kind === "new");
      const uploadedId = new Map<string, string>();
      if (fresh.length) {
        const data = new FormData();
        fresh.forEach((image) => data.append("files", image.file));
        const created: MaterialImage[] = await request(base, { method: "POST", headers: auth, body: data });
        fresh.forEach((image, index) => uploadedId.set(image.key, created[index]?.id));
      }

      // 3) Asosiy rasm belgilanadi
      const mainId = uploadedId.get(mainKey) || (kept.has(mainKey) ? mainKey : "");
      if (mainId) await request(`${base}/${mainId}/main`, { method: "PUT", headers: auth });

      releasePreviews(images);
      setIsOpen(false);
    } catch (err: any) {
      // Material saqlangan, lekin rasmda xato bo'lishi mumkin - ro'yxat baribir yangilanadi
      setFormError(err.message);
    } finally {
      setIsSaving(false);
      await load();
    }
  };

  const remove = async (row: Material) => {
    if (!window.confirm(t("ref.delete_confirm", { name: row.name }))) return;
    try {
      const res = await fetch(`/api/materials/${row.id}`, { method: "DELETE", headers: auth });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("users.delete_error")));
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const select = (key: keyof Form, options: { value: string; label: string }[], required?: boolean) => (
    <select value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} className={inputClass}>
      <option value="">{required ? t("ref.choose") : t("ref.not_selected")}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );

  const hasActions = mayUpdate || mayDelete;
  const columnCount = 9 + (hasActions ? 1 : 0);

  return (
    <>
      <PageMeta title={`${t("modules.materials.title")} | Gulbahor`} description={t("modules.materials.desc")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        {/* Yuqori panel */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">{t("modules.materials.title")}</h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-8 max-w-56 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">{t("materials.all_categories")}</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t("materials.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-44 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-64"
              />
            </div>
            {mayCreate && (
              <Button onClick={() => openForm()} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.add")}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Jadval */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={`${th} w-14`}>{t("materials.image")}</th>
                <th className={th}>{t("ref.name")}</th>
                <th className={th}>{t("materials.category")}</th>
                <th className={th}>{t("materials.brand")}</th>
                <th className={th}>{t("materials.color")}</th>
                <th className={th}>{t("materials.size")}</th>
                <th className={th}>{t("materials.unit")}</th>
                <th className={th}>{t("materials.mxik")}</th>
                <th className={th}>{t("ref.status")}</th>
                {hasActions && <th className={`${th} text-right`}>{t("users.actions")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-gray-500">{t("common.loading")}</td></tr>
              ) : loadError ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-red-500">{loadError}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-gray-500">{t("ref.empty")}</td></tr>
              ) : (
                pageRows.map((row) => {
                  const image = mainImage(row);
                  return (
                    <tr key={row.id} className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                      <td className={td}>
                        {image ? (
                          <img src={image.url} alt="" loading="lazy" className="h-10 w-10 rounded-md border border-gray-200 object-cover dark:border-gray-700" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-300 dark:border-gray-700 dark:text-gray-600">
                            <ImageOff className="h-4 w-4" />
                          </span>
                        )}
                      </td>
                      <td className={td}>
                        <span className="block font-medium text-gray-900 dark:text-white">{row.name}</span>
                        {(row.sku || row.barcode) && (
                          <span className="block font-mono text-xs text-gray-500 dark:text-gray-400">
                            {[row.sku, row.barcode].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className={td}>{categoryLabel.get(row.categoryId) || localized(row.category?.name, lang) || "—"}</td>
                      <td className={td}>{row.brand?.name || "—"}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {row.color ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 shrink-0 rounded-full border border-gray-300 dark:border-gray-600" style={row.color.hex ? { backgroundColor: row.color.hex } : undefined} />
                            {localized(row.color.name, lang)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{row.size?.name || "—"}</td>
                      <td className={`${td} whitespace-nowrap`}>{localized(row.unit?.shortName, lang) || "—"}</td>
                      <td className={`${td} font-mono text-xs`}>{row.mxikCode || "—"}</td>
                      <td className={`${td} whitespace-nowrap`}><ActiveBadge active={row.isActive} /></td>
                      {hasActions && (
                        <td className={`${td} whitespace-nowrap text-right`}>
                          <span className="inline-flex items-center gap-3.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                            {mayUpdate && (
                              <button onClick={() => openForm(row)} title={t("common.edit")} aria-label={t("common.edit")} className="text-gray-400 hover:text-brand-500">
                                <Edit className="h-4 w-4" />
                              </button>
                            )}
                            {mayDelete && (
                              <button onClick={() => remove(row)} title={t("common.delete")} aria-label={t("common.delete")} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={filtered.length}
          overall={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </div>

      {/* Qo'shish / tahrirlash oynasi */}
      {isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editing ? t("materials.edit") : t("materials.add")}
              </h3>
              <button onClick={closeForm} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
              <div className="grid grid-cols-6 gap-x-4 gap-y-4">
                <SectionTitle>{t("materials.section_main")}</SectionTitle>
                <Field label={t("ref.name")} required>
                  <input type="text" maxLength={255} value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
                </Field>
                <Field label={t("materials.category")} required half>{select("categoryId", categoryOptions, true)}</Field>
                <Field label={t("materials.brand")} half>{select("brandId", brands.map((b) => ({ value: b.id, label: b.name })))}</Field>
                <Field label={t("materials.color")} half>{select("colorId", colors.map((c) => ({ value: c.id, label: localized(c.name, lang) })))}</Field>
                <Field label={t("materials.size")} half>
                  {select("sizeId", sizes.map((s) => ({ value: s.id, label: s.scale ? `${s.name} (${s.scale})` : s.name })))}
                </Field>
                <Field label={t("materials.unit")} required half>
                  {select("unitId", units.map((u) => ({ value: u.id, label: `${localized(u.name, lang)} (${localized(u.shortName, lang)})` })), true)}
                </Field>
                <Field label={t("materials.country")} half>{select("countryId", countries.map((c) => ({ value: c.id, label: localized(c.name, lang) })))}</Field>
                <Field label={t("materials.sku")} half>
                  <input type="text" maxLength={60} value={form.sku} onChange={(e) => set("sku", e.target.value)} className={`${inputClass} font-mono`} />
                </Field>
                <Field label={t("materials.barcode")} half>
                  <input type="text" maxLength={60} value={form.barcode} onChange={(e) => set("barcode", e.target.value.replace(/[^A-Za-z0-9-]/g, ""))} className={`${inputClass} font-mono`} />
                </Field>
                <Field label={t("ref.description")}>
                  <textarea rows={2} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputClass} h-auto py-2`} />
                </Field>

                <SectionTitle>{t("materials.section_images")}</SectionTitle>
                <div className="col-span-6">
                  <div className="flex flex-wrap gap-3">
                    {images.map((image) => {
                      const isMain = image.key === mainKey;
                      return (
                        <div
                          key={image.key}
                          className={`group/img relative h-24 w-24 overflow-hidden rounded-lg border-2 ${isMain ? "border-brand-500" : "border-gray-200 dark:border-gray-700"}`}
                        >
                          <img src={image.url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setMainKey(image.key)}
                            title={isMain ? t("materials.image_main") : t("materials.image_make_main")}
                            aria-label={isMain ? t("materials.image_main") : t("materials.image_make_main")}
                            aria-pressed={isMain}
                            className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full shadow ${
                              isMain ? "bg-brand-500 text-white" : "bg-white/90 text-gray-400 hover:text-brand-500"
                            }`}
                          >
                            <Star className="h-3.5 w-3.5" fill={isMain ? "currentColor" : "none"} />
                          </button>
                          <button
                            type="button"
                            onClick={() => dropImage(image)}
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-500 shadow hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          {isMain && (
                            <span className="absolute inset-x-0 bottom-0 bg-brand-500 py-0.5 text-center text-[10px] font-semibold text-white">
                              {t("materials.image_main")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {images.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-brand-400 hover:text-brand-500 dark:border-gray-700"
                      >
                        <ImagePlus className="h-5 w-5" />
                        {t("materials.image_add")}
                      </button>
                    )}
                  </div>
                  <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(",")} multiple hidden onChange={pickFiles} />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t("materials.image_hint", { count: MAX_IMAGES })}</p>
                </div>

                <Field label={t("materials.sale_price")} hint={t("materials.sale_price_hint")} half>
                  <input
                    type="text" inputMode="decimal" value={form.salePrice} placeholder="350000"
                    onChange={(e) => set("salePrice", e.target.value.replace(/[^\d.,\s]/g, ""))}
                    className={`${inputClass} text-right font-semibold`}
                  />
                </Field>

                <SectionTitle>{t("materials.section_tax")}</SectionTitle>
                <Field label={t("materials.mxik")} hint={t("materials.mxik_hint")} half>
                  <input type="text" inputMode="numeric" value={form.mxikCode} onChange={(e) => set("mxikCode", digits(e.target.value, 17))} className={`${inputClass} font-mono`} placeholder="06203001001000000" />
                </Field>
                <Field label={t("materials.package_code")} hint={t("materials.package_hint")} half>
                  <input type="text" inputMode="numeric" value={form.packageCode} onChange={(e) => set("packageCode", digits(e.target.value, 20))} className={`${inputClass} font-mono`} />
                </Field>
                <Field label={t("materials.tnved")} hint={t("materials.tnved_hint")} half>
                  <input type="text" inputMode="numeric" value={form.tnvedCode} onChange={(e) => set("tnvedCode", digits(e.target.value, 10))} className={`${inputClass} font-mono`} placeholder="6205200000" />
                </Field>
                <Field label={t("materials.vat")} half>
                  <select value={form.vatRate} onChange={(e) => set("vatRate", e.target.value)} className={inputClass}>
                    <option value="">{t("materials.vat_none")}</option>
                    {VAT_RATES.map((rate) => (
                      <option key={rate} value={rate}>{rate}%</option>
                    ))}
                    {/* Ro'yxatda yo'q stavka bilan saqlangan material ham to'g'ri ko'rinsin */}
                    {form.vatRate !== "" && !VAT_RATES.includes(form.vatRate) && <option value={form.vatRate}>{form.vatRate}%</option>}
                  </select>
                </Field>
                <label className="col-span-6 flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={form.isMarked} onChange={(e) => set("isMarked", e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t("materials.marked")}
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{t("materials.marked_hint")}</span>
                  </span>
                </label>

                <label className="col-span-6 flex cursor-pointer items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{t("ref.is_active")}</span>
                </label>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              {formError && <p className="mb-3 text-sm font-medium text-red-500">{formError}</p>}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={closeForm}>{t("common.cancel")}</Button>
                <Button onClick={save} disabled={isSaving}>{isSaving ? t("common.saving") : t("common.save")}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
