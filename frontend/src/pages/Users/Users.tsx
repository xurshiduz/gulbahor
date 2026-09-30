import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { Edit, Trash2, Plus, Search, SlidersHorizontal, Shield, RefreshCw, Copy, X, KeyRound, Ban, LogIn, History, CheckCircle2, LockKeyhole } from "lucide-react";
import Button from "../../components/ui/button/Button";
import { Link, useNavigate } from "react-router";
import Input from "../../components/form/input/InputField";
import { useAuth } from "../../context/AuthContext";
import PinInput from "../../components/common/PinInput";
import { saveImpersonator } from "../../utils/impersonation";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { actionLabel, resourceLabel } from "../../utils/permissionLabels";
import ExtraPermissionsModal from "./ExtraPermissionsModal";
import UserHistoryModal from "./UserHistoryModal";
import { useReferenceList } from "../../components/reference/ReferenceCrud";

interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  roleIds: string[];
  /** Rol huquqlaridan tashqari, shu xodimga alohida berilgan huquqlar */
  extraPermissions: { id: string; name: string; resourceLabel?: string | null; actionLabel?: string | null }[];
  isActive: boolean;
  /** Tarmoq cheklovi yoqilganda tashqaridan ishlashga ruxsat - faqat Super admin qo'yadi */
  remoteAccess: boolean;
  /** Xodim ishlaydigan filial (Ma'muriyat -> Filiallar) */
  branchId: string;
  branchName: string;
  googleLinked: boolean;
  faceIdEnabled: boolean;
  qrEnabled: boolean;
}

const ADMIN_ROLE_PATTERN = /^(admin|administrator|superadmin|super admin)$/i;
const SUPER_ADMIN_ROLE_PATTERN = /^(superadmin|super admin)$/i;

const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "",
  э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

/** F.I.O dan login yasaydi: "Turdiyev Alisher Baxtiyorovich" -> "turdiyev.alisher" */
function slugifyName(name: string) {
  const latin = (name || "")
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, "")
    .split("")
    .map((ch) => CYRILLIC_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return latin.split(/\s+/).filter(Boolean).slice(0, 2).join(".");
}

/** Telefondan +998 dan keyingi 9 ta raqamni ajratib oladi */
function extractPhoneDigits(value: string) {
  let digits = (value || "").replace(/[^0-9]/g, "");
  // Mamlakat kodi faqat undan keyin to'liq 9 raqam bo'lsa kesiladi: "99 803 85 96"
  // ham 998 bilan boshlanadi - u operator kodi, uni kesib bo'lmaydi
  if (digits.length > 9 && digits.startsWith("998")) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** 901234567 -> "90 123 45 67" (maydonda ko'rsatish uchun) */
function formatPhoneDigits(digits: string) {
  const d = digits || "";
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
}

/** Jadvalda ko'rsatish uchun: +998 90 123 45 67 */
function formatPhoneFull(value: string) {
  const digits = extractPhoneDigits(value);
  return digits ? `+998 ${formatPhoneDigits(digits)}` : "";
}

/** Loginda faqat harf, raqam, "." va "_" - qolgani (probel, belgilar) olib tashlanadi */
function sanitizeUsername(value: string) {
  return (value || "").replace(/[^a-zA-Z0-9._]/g, "");
}

/** Chalkashtirmaydigan belgilardan tasodifiy parol */
function generatePassword(length = 10) {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join("");
}

/** Tashqariga bosilganda yopiladigan kichik oyna uchun */
function useOutsideClose(isOpen: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  return ref;
}

/** "Qo'shimcha huquqlar" katagi: soni + ro'yxat popover, tahrirlash tugmasi */
function ExtraPermissionsCell({ perms, onEdit }: { perms: User["extraPermissions"]; onEdit?: () => void }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useOutsideClose(isOpen, () => setIsOpen(false));

  return (
    <span ref={ref} className="relative inline-flex items-center gap-1.5">
      {perms.length > 0 ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-400"
          title={t("users.extra_title")}
        >
          {perms.length}
        </button>
      ) : (
        <span className="text-gray-400">—</span>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-gray-800"
          title={t("users.extra_edit")}
          aria-label={t("users.extra_edit")}
        >
          <LockKeyhole className="h-3.5 w-3.5" />
        </button>
      )}
      {isOpen && (
        <span className="absolute left-0 top-full z-50 mt-1 flex min-w-56 max-w-xs flex-col gap-0.5 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {perms.map((p) => (
            <span key={p.id} className="whitespace-normal rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-300">
              {resourceLabel(t, p)} — {actionLabel(t, p)}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * Rol katagi: birinchi rol, qolganlari soni belgi bilan ("+2"). Belgi
 * bosilganda barcha rollar ro'yxati kichik oynada chiqadi.
 */
function RoleCell({ role }: { role: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useOutsideClose(isOpen, () => setIsOpen(false));
  const names = (role || "").split(", ").filter(Boolean);

  if (names.length === 0) return <span className="text-gray-400">—</span>;

  return (
    <span ref={ref} className="relative inline-flex items-center gap-1">
      <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-md bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {names[0]}
      </span>
      {names.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white hover:bg-brand-600"
        >
          +{names.length - 1}
        </button>
      )}
      {isOpen && (
        <span className="absolute left-0 top-full z-50 mt-1 flex min-w-40 flex-col gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {names.map((name) => (
            <span key={name} className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50">
              {name}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

const thLabel = "text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap mb-2 mt-0.5";
const filterInput = "h-7 pl-6 pr-2 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500 font-normal normal-case placeholder-gray-400 dark:text-white";
const filterSelect = "h-7 px-2 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500 font-normal normal-case text-gray-700 dark:text-gray-300";
// Sichqonchali ekranda amallar qator ustiga kelganda chiqadi; sensorli ekranda doim ko'rinadi
const rowAction = "transition-colors lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100";

type TextFilter = "name" | "username" | "phone" | "email";

export default function Users() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, logout, login, user: currentUser } = useAuth();
  const { isAdmin, isSuperAdmin, can, canView, canCreate, canUpdate, canDelete } = usePermissions();
  const canBlock = can("block:users");

  // Admin va Super admin rolini faqat Super admin bera oladi
  const canAssignRole = (name: string) => isSuperAdmin || !ADMIN_ROLE_PATTERN.test(name.trim());
  /** O'zidan yuqori turgan foydalanuvchiga tegib bo'lmaydi (server ham shuni tekshiradi) */
  const canManage = (user: User) => {
    const names = user.role.split(", ");
    if (names.some((n) => SUPER_ADMIN_ROLE_PATTERN.test(n))) return isSuperAdmin;
    if (names.some((n) => ADMIN_ROLE_PATTERN.test(n))) return isAdmin;
    return true;
  };

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Qo'shimcha huquqlar va kirish tarixi oynalari: qaysi xodim uchun
  const [extraEditing, setExtraEditing] = useState<User | null>(null);
  const [historyOf, setHistoryOf] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    roleIds: [] as string[],
    remoteAccess: false,
    branchId: "",
  });
  // Filial tanlash ro'yxati (forma va filtr uchun)
  const branches = useReferenceList<{ id: string; name: string; isActive?: boolean }>("/api/branches");
  // Login qo'lda o'zgartirilgan bo'lsa - F.I.O yozilganda uni bosib ketmaymiz
  const [isUsernameEdited, setIsUsernameEdited] = useState(false);
  // Yangi foydalanuvchi yaratilgach yoki parol yangilangach login/parolni ko'rsatib turamiz
  const [credentials, setCredentials] = useState<{ name: string; username: string; password: string; isNew: boolean } | null>(null);

  const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [usersRes, rolesRes] = await Promise.all([
        fetch('/api/users', { headers: authHeaders }),
        fetch('/api/roles', { headers: authHeaders }),
      ]);

      if (usersRes.status === 401) {
        logout();
        return;
      }
      if (!usersRes.ok || !rolesRes.ok) throw new Error(t("common.load_error"));

      const usersData = await usersRes.json();
      const rolesData = await rolesRes.json();

      setUsers(usersData.map((u: any): User => ({
        id: u.id,
        name: u.name || "",
        username: u.username || "",
        email: u.email || "",
        phone: u.phone || "",
        role: u.roles?.map((r: any) => r.name).join(', ') || "",
        roleIds: u.roles?.map((r: any) => r.id) || [],
        extraPermissions: u.extraPermissions || [],
        googleLinked: !!u.googleId,
        faceIdEnabled: !!u.faceIdEnabled,
        qrEnabled: !!u.qrEnabled,
        isActive: u.isActive !== false,
        remoteAccess: u.remoteAccess === true,
        branchId: u.branch?.id || "",
        branchName: u.branch?.name || "",
      })));
      setRoles(rolesData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Ustun filtrlari
  const [filters, setFilters] = useState({ name: "", username: "", email: "", phone: "", role: "", status: "", branch: "" });
  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  /* --------------------------- Xodim nomidan kirish -------------------------- */
  // Faqat Super admin. PIN so'raladi, backend tekshiradi. Admin seansi
  // saqlanib, tepadagi sariq chiziqdan qaytiladi.
  const [impersonating, setImpersonating] = useState<User | null>(null);
  const [impersonatePin, setImpersonatePin] = useState("");
  const [impersonateError, setImpersonateError] = useState("");
  const [isImpersonating, setIsImpersonating] = useState(false);

  const openImpersonate = (user: User) => {
    setImpersonating(user);
    setImpersonatePin("");
    setImpersonateError("");
  };

  const impersonate = async (pin: string) => {
    if (!impersonating || isImpersonating) return;
    setIsImpersonating(true);
    try {
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ userId: impersonating.id, pin }),
      });
      const data = await readJson(res);
      if (!res.ok || !data?.accessToken) {
        setImpersonateError(res.status === 401 ? t("lock.wrong_pin") : errorMessage(data, t("common.error")));
        setImpersonatePin("");
        return;
      }
      saveImpersonator(token as string, currentUser);
      login(data.accessToken, data.user);
      setImpersonating(null);
      navigate("/");
    } catch {
      setImpersonateError(t("common.server_unreachable"));
    } finally {
      setIsImpersonating(false);
    }
  };

  /* ---------------------------- Faollik va parol ---------------------------- */

  const post = async (path: string) => {
    const res = await fetch(path, { method: "POST", headers: authHeaders });
    const data = await readJson(res);
    if (!res.ok) throw new Error(errorMessage(data, t("common.error")));
    return data;
  };

  const activateUser = async (user: User) => {
    if (!confirm(t("users.activate_confirm", { name: user.name }))) return;
    try {
      await post(`/api/users/${user.id}/activate`);
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const deactivateUser = async (user: User) => {
    if (!confirm(t("users.deactivate_confirm", { name: user.name }))) return;
    try {
      await post(`/api/users/${user.id}/deactivate`);
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  /** Yangi parol serverda yasaladi va faqat shu yerda bir marta ko'rsatiladi */
  const resetPassword = async (user: User) => {
    if (!confirm(t("users.reset_confirm", { name: user.name }))) return;
    try {
      const data = await post(`/api/users/${user.id}/reset-password`);
      setCredentials({ name: user.name, username: data.username, password: data.password, isNew: false });
    } catch (err: any) {
      alert(err.message);
    }
  };

  /* ------------------------ Sahifalash va ustunlar ------------------------ */
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(filters.name.toLowerCase()) &&
    u.username.toLowerCase().includes(filters.username.toLowerCase()) &&
    u.email.toLowerCase().includes(filters.email.toLowerCase()) &&
    extractPhoneDigits(u.phone).includes(filters.phone.replace(/\D/g, "").replace(/^998/, "")) &&
    // Aniq rol nomi: "Admin" tanlansa "Super admin" tushmasin
    (filters.role === "" || u.role.split(", ").includes(filters.role)) &&
    (filters.status === "" || String(u.isActive) === filters.status) &&
    (filters.branch === "" || u.branchId === filters.branch)
  );

  const currentUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const columns: { id: string; label: string }[] = [
    { id: 'name', label: t("users.name") },
    { id: 'username', label: t("users.login") },
    { id: 'phone', label: t("users.phone") },
    { id: 'status', label: t("users.status") },
    { id: 'email', label: t("users.email") },
    { id: 'role', label: t("users.role") },
    { id: 'branch', label: t("ref.branch") },
    { id: 'extra', label: t("users.extra_title") },
    { id: 'google', label: "Google" },
    { id: 'face', label: "FaceID" },
    { id: 'qr', label: t("users.qr") },
    { id: 'actions', label: t("users.actions") },
  ];

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const fallback = ["name", "username", "phone", "status", "role", "branch", "actions"];
    try {
      const saved = JSON.parse(localStorage.getItem("usersTableColumns.v2") || "null");
      return Array.isArray(saved) && saved.length ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const columnsRef = useOutsideClose(isColumnDropdownOpen, () => setIsColumnDropdownOpen(false));

  useEffect(() => {
    localStorage.setItem("usersTableColumns.v2", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };
  const shown = (id: string) => visibleColumns.includes(id);
  const shownCount = columns.filter((c) => shown(c.id)).length || 1;

  /* ------------------------------ Qo'shish / tahrir ----------------------------- */

  /** Login band bo'lsa oxiriga raqam qo'shadi: turdiyev.alisher2 */
  const makeUniqueUsername = (base: string) => {
    if (!base) return "";
    const taken = new Set(users.map((u) => u.username.toLowerCase()));
    let candidate = base;
    let counter = 1;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = `${base}${counter}`;
    }
    return candidate;
  };

  /** F.I.O yozilganda login avtomatik yasaladi (qo'lda tegilmagan bo'lsa) */
  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      name: value,
      username: editingUser || isUsernameEdited ? prev.username : makeUniqueUsername(slugifyName(value)),
    }));
  };

  const openModal = (user?: User) => {
    setIsUsernameEdited(false);
    setFormError("");
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        username: user.username,
        email: user.email,
        phone: extractPhoneDigits(user.phone),
        password: "",
        roleIds: user.roleIds,
        remoteAccess: user.remoteAccess,
        branchId: user.branchId,
      });
    } else {
      setEditingUser(null);
      setFormData({ name: "", username: "", email: "", phone: "", password: generatePassword(), roleIds: [], remoteAccess: false, branchId: "" });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSave = async () => {
    const name = formData.name.trim();
    const phoneDigits = extractPhoneDigits(formData.phone);
    const email = formData.email.trim();
    const username = sanitizeUsername(formData.username);
    const isEditing = !!editingUser;
    const password = isEditing ? "" : formData.password;

    // Majburiy maydonlar: F.I.O, Telefon va Login. Email ixtiyoriy.
    if (!name) return setFormError(t("users.err_name"));
    if (!username) return setFormError(t("users.err_login"));
    if (phoneDigits.length !== 9) return setFormError(t("users.err_phone"));
    if (!isEditing && password.length < 6) return setFormError(t("profile.password_too_short"));

    try {
      setIsSaving(true);
      setFormError("");

      const payload: Record<string, any> = {
        name,
        username,
        phone: `+998${phoneDigits}`,
        roleIds: formData.roleIds,
        // Tanlanmagan bo'lsa null - filialdan chiqarish
        branchId: formData.branchId || null,
        // Tashqaridan ishlashga ruxsat - faqat Super admin yuboradi (server ham shuni tekshiradi)
        ...(isSuperAdmin ? { remoteAccess: formData.remoteAccess } : {}),
        // Bo'sh email yuborilmaydi; tahrirlashda tozalansa - null bilan o'chiriladi
        ...(email ? { email } : isEditing ? { email: null } : {}),
        ...(isEditing ? {} : { password }),
      };

      const res = await fetch(isEditing ? `/api/users/${editingUser.id}` : '/api/users', {
        method: isEditing ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.save_error")));

      if (!isEditing) setCredentials({ name, username, password, isNew: true });

      fetchData();
      closeModal();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(t("users.delete_confirm", { name: user.name }))) return;
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("users.delete_error")));
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const textFilterHeader = (id: TextFilter, label: string, width: string) => (
    <th className="px-4 md:px-6 py-2.5 text-left">
      <div className={thLabel}>{label}</div>
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t("common.search")}
          value={filters[id]}
          onChange={(e) => setFilter(id, e.target.value)}
          className={`w-full ${width} ${filterInput}`}
        />
      </div>
    </th>
  );

  const connectedCell = (on: boolean) => (
    <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm">
      {on ? (
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("users.connected")}
        </span>
      ) : (
        <span className="text-gray-400">{t("users.not_connected")}</span>
      )}
    </td>
  );

  return (
    <>
      <PageMeta title={`${t("users.title")} | Gulbahor`} description={t("users.title")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        {/* Yuqori panel */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">
            {t("users.title")}
          </h2>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="relative" ref={columnsRef}>
              <button
                onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
                title={t("users.columns")}
                aria-label={t("users.columns")}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              {isColumnDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-2">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-2 uppercase tracking-wider">
                    {t("users.columns")}
                  </div>
                  <div className="space-y-1">
                    {columns.map(col => (
                      <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shown(col.id)}
                          onChange={() => toggleColumn(col.id)}
                          className="rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </span>

            {canView("roles") && (
              <Link to="/roles">
                <Button variant="outline" className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm border-gray-300">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("sidebar.roles")}</span>
                </Button>
              </Link>
            )}
            {canCreate("users") && (
              <Button onClick={() => openModal()} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.add")}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Yangi yaratilgan foydalanuvchi yoki yangilangan parol - bir marta ko'rsatiladi */}
        {credentials && (
          <div className="mx-4 md:mx-6 mt-3 flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm dark:border-green-500/20 dark:bg-green-500/10">
            <div className="text-green-800 dark:text-green-300">
              <div className="font-medium">
                {t(credentials.isNew ? "users.created_banner" : "users.reset_banner", { name: credentials.name })}
              </div>
              <div className="mt-1 font-mono text-xs">
                {t("users.login")}: <span className="font-semibold">{credentials.username}</span>
                <span className="mx-2 text-green-500">|</span>
                {t("auth.password")}: <span className="font-semibold">{credentials.password}</span>
              </div>
              <div className="mt-1 text-xs text-green-700/80 dark:text-green-400/80">{t("users.password_once")}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                title={t("common.copy")}
                aria-label={t("common.copy")}
                onClick={() => navigator.clipboard?.writeText(`${t("users.login")}: ${credentials.username} / ${t("auth.password")}: ${credentials.password}`)}
                className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-500/20 text-green-700 dark:text-green-300"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                title={t("common.close")}
                aria-label={t("common.close")}
                onClick={() => setCredentials(null)}
                className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-500/20 text-green-700 dark:text-green-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Jadval */}
        <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-900">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr className="align-top">
                {shown('name') && textFilterHeader('name', t("users.name"), "sm:w-48")}
                {shown('username') && textFilterHeader('username', t("users.login"), "sm:w-40")}
                {shown('phone') && textFilterHeader('phone', t("users.phone"), "sm:w-40")}
                {shown('status') && (
                  <th className="px-4 md:px-6 py-2.5 text-left">
                    <div className={thLabel}>{t("users.status")}</div>
                    <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={`w-full sm:w-32 ${filterSelect}`}>
                      <option value="">{t("common.all")}</option>
                      <option value="true">{t("users.active")}</option>
                      <option value="false">{t("users.inactive")}</option>
                    </select>
                  </th>
                )}
                {shown('email') && textFilterHeader('email', t("users.email"), "sm:w-48")}
                {shown('role') && (
                  <th className="px-4 md:px-6 py-2.5 text-left">
                    <div className={thLabel}>{t("users.role")}</div>
                    <select value={filters.role} onChange={(e) => setFilter('role', e.target.value)} className={`w-full sm:w-36 ${filterSelect}`}>
                      <option value="">{t("common.all")}</option>
                      {[...roles].sort((x, y) => x.name.localeCompare(y.name)).map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </th>
                )}
                {shown('branch') && (
                  <th className="px-4 md:px-6 py-2.5 text-left">
                    <div className={thLabel}>{t("ref.branch")}</div>
                    <select value={filters.branch} onChange={(e) => setFilter('branch', e.target.value)} className={`w-full sm:w-36 ${filterSelect}`}>
                      <option value="">{t("common.all")}</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </th>
                )}
                {shown('extra') && <th className="px-4 md:px-6 py-2.5 text-left"><div className={thLabel}>{t("users.extra_title")}</div></th>}
                {shown('google') && <th className="px-4 md:px-6 py-2.5 text-left"><div className={thLabel}>Google</div></th>}
                {shown('face') && <th className="px-4 md:px-6 py-2.5 text-left"><div className={thLabel}>FaceID</div></th>}
                {shown('qr') && <th className="px-4 md:px-6 py-2.5 text-left"><div className={thLabel}>{t("users.qr")}</div></th>}
                {shown('actions') && <th className="px-4 md:px-6 py-2.5 text-right"><div className={thLabel}>{t("users.actions")}</div></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={shownCount} className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("common.loading")}</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={shownCount} className="px-6 py-10 text-center text-sm text-red-500">{error}</td>
                </tr>
              ) : currentUsers.length === 0 ? (
                <tr>
                  <td colSpan={shownCount} className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("users.empty")}</td>
                </tr>
              ) : (
                currentUsers.map((user) => {
                  const manageable = canManage(user);
                  const isSelf = user.id === currentUser?.id;
                  return (
                  <tr key={user.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors group">
                    {shown('name') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-white/90">
                        {user.name}
                        {isSelf && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">{t("users.you")}</span>}
                      </td>
                    )}
                    {shown('username') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-600 dark:text-gray-300">{user.username || '-'}</td>
                    )}
                    {shown('phone') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatPhoneFull(user.phone) || '-'}</td>
                    )}
                    {shown('status') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm">
                        {user.isActive ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-md bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                              {t("users.active")}
                            </span>
                            {canBlock && manageable && !isSelf && (
                              <button
                                onClick={() => deactivateUser(user)}
                                title={t("users.deactivate")}
                                aria-label={t("users.deactivate")}
                                className={`text-gray-400 hover:text-red-500 ${rowAction}`}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : canBlock && manageable ? (
                          <button
                            onClick={() => activateUser(user)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t("users.activate")}
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {t("users.inactive")}
                          </span>
                        )}
                      </td>
                    )}
                    {shown('email') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.email || '-'}</td>
                    )}
                    {shown('role') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm"><RoleCell role={user.role} /></td>
                    )}
                    {shown('branch') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{user.branchName || '—'}</td>
                    )}
                    {shown('extra') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm">
                        <ExtraPermissionsCell
                          perms={user.extraPermissions}
                          // Qo'shimcha huquqni faqat Admin beradi
                          onEdit={isAdmin && manageable ? () => setExtraEditing(user) : undefined}
                        />
                      </td>
                    )}
                    {shown('google') && connectedCell(user.googleLinked)}
                    {shown('face') && connectedCell(user.faceIdEnabled)}
                    {shown('qr') && connectedCell(user.qrEnabled)}
                    {shown('actions') && (
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <span className="inline-flex items-center gap-3.5">
                          <button
                            onClick={() => setHistoryOf(user)}
                            className={`text-gray-400 hover:text-blue-500 ${rowAction}`}
                            title={t("sessions.title")}
                            aria-label={t("sessions.title")}
                          >
                            <History className="w-4 h-4" />
                          </button>
                          {isSuperAdmin && !isSelf && user.isActive && (
                            <button
                              onClick={() => openImpersonate(user)}
                              className={`text-gray-400 hover:text-amber-500 ${rowAction}`}
                              title={t("users.impersonate")}
                              aria-label={t("users.impersonate")}
                            >
                              <LogIn className="w-4 h-4" />
                            </button>
                          )}
                          {canUpdate("users") && manageable && (
                            <>
                              <button
                                onClick={() => resetPassword(user)}
                                className={`text-gray-400 hover:text-violet-500 ${rowAction}`}
                                title={t("users.reset_password")}
                                aria-label={t("users.reset_password")}
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openModal(user)}
                                className={`text-gray-400 hover:text-brand-500 ${rowAction}`}
                                title={t("common.edit")}
                                aria-label={t("common.edit")}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {canDelete("users") && manageable && !isSelf && (
                            <button
                              onClick={() => handleDelete(user)}
                              className={`text-gray-400 hover:text-red-500 ${rowAction}`}
                              title={t("common.delete")}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 className="w-4 h-4" />
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
          pageSize={itemsPerPage}
          total={filteredUsers.length}
          overall={users.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
        />
      </div>

      {/* Qo'shish / tahrirlash oynasi */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingUser ? t("users.edit_user") : t("users.add_user")}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("users.name")} <span className="text-red-500">*</span>
                </label>
                <Input type="text" value={formData.name} onChange={(e) => handleNameChange(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("users.login")} <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => {
                    setIsUsernameEdited(true);
                    setFormData({ ...formData, username: sanitizeUsername(e.target.value) });
                  }}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("users.login_hint")}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("users.phone")} <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <span className="inline-flex items-center h-11 px-3 rounded-l-lg border border-r-0 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 select-none">
                    +998
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="90 123 45 67"
                    value={formatPhoneDigits(formData.phone)}
                    onChange={(e) => setFormData({ ...formData, phone: extractPhoneDigits(e.target.value) })}
                    className="h-11 w-full rounded-r-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("users.phone_hint")}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("users.email")} <span className="text-gray-400 font-normal">({t("common.optional")})</span>
                </label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("auth.password")} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input type="text" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                    </div>
                    <button
                      type="button"
                      title={t("users.password_generate")}
                      aria-label={t("users.password_generate")}
                      onClick={() => setFormData((prev) => ({ ...prev, password: generatePassword() }))}
                      className="flex items-center justify-center w-9 h-11 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title={t("common.copy")}
                      aria-label={t("common.copy")}
                      onClick={() => navigator.clipboard?.writeText(formData.password)}
                      className="flex items-center justify-center w-9 h-11 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("users.password_hint")}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("ref.branch")} <span className="text-gray-400 font-normal">({t("common.optional")})</span>
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="">{t("ref.not_selected")}</option>
                  {/* Yopilgan filial yangi xodimga taklif qilinmaydi, lekin allaqachon tanlangani ko'rinib turadi */}
                  {branches.filter((b) => b.isActive !== false || b.id === formData.branchId).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {branches.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("users.no_branches")}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-800 pb-1">
                  {t("users.role")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.filter(r => canAssignRole(r.name) || formData.roleIds.includes(r.id)).map(r => {
                    const locked = !canAssignRole(r.name);
                    return (
                    <label key={r.id} className={`flex items-center gap-2 group ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} title={locked ? t("users.role_super_only") : undefined}>
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={formData.roleIds.includes(r.id)}
                        onChange={() => {
                          setFormData(prev => ({
                            ...prev,
                            roleIds: prev.roleIds.includes(r.id)
                              ? prev.roleIds.filter(id => id !== r.id)
                              : [...prev.roleIds, r.id]
                          }))
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                        {r.name}
                      </span>
                    </label>
                    );
                  })}
                </div>
              </div>
              {isSuperAdmin && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.remoteAccess}
                    onChange={(e) => setFormData((prev) => ({ ...prev, remoteAccess: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-amber-900 dark:text-amber-200">
                    <b>{t("users.remote_access")}</b>
                    <span className="block text-xs text-amber-800/80 dark:text-amber-300/80">{t("users.remote_access_hint")}</span>
                  </span>
                </label>
              )}
            </div>

            {formError && <p className="mt-4 text-sm font-medium text-red-500">{formError}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={closeModal}>{t("common.cancel")}</Button>
              <Button onClick={handleSave} disabled={isSaving}>{isSaving ? t("common.saving") : t("common.save")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Xodim nomidan kirish - PIN bilan */}
      {impersonating && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("users.impersonate_title")}</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {impersonating.name} · {impersonating.username}
                </p>
              </div>
              <button onClick={() => setImpersonating(null)} aria-label={t("common.close")} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t("users.impersonate_text")}</p>
            <div className="mt-5 flex justify-center">
              <PinInput
                masked
                value={impersonatePin}
                onChange={(value) => { setImpersonatePin(value); setImpersonateError(""); }}
                onComplete={impersonate}
                autoFocus
                invalid={Boolean(impersonateError)}
                disabled={isImpersonating}
              />
            </div>
            <p className={`mt-3 h-5 text-center text-sm font-medium ${impersonateError ? "text-red-500" : "text-gray-400"}`}>
              {isImpersonating ? t("common.loading") : impersonateError}
            </p>
          </div>
        </div>
      )}

      {extraEditing && (
        <ExtraPermissionsModal user={extraEditing} token={token} onClose={() => setExtraEditing(null)} onSaved={fetchData} />
      )}
      {historyOf && (
        <UserHistoryModal user={historyOf} token={token} onClose={() => setHistoryOf(null)} />
      )}
    </>
  );
}
