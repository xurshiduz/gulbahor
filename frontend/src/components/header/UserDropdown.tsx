import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Lock, LogOut, User, History } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";

export default function UserDropdown() {
  const { t } = useTranslation();
  const { user, logout, lock } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggleDropdown = () => setIsOpen(!isOpen);

  // Tashqariga bosilganda yoki Esc bilan yopiladi
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setIsOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  // Foydalanuvchi hali yuklanmagan bo'lsa - zaxira qiymatlar
  const name = user?.name || user?.username || t("header.user_fallback");
  const email = user?.email || "";
  const roleNames: string[] = (user?.roles || []).map((r: any) => r.name).filter(Boolean);
  const initials = name.substring(0, 2).toUpperCase();

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    navigate("/signin");
  };

  /**
   * Qo'lda qulflash. PIN kod hali o'rnatilmagan bo'lsa qulflash mantiqsiz -
   * ochib bo'lmaydi, shuning uchun profilga olib boramiz.
   */
  const handleLock = () => {
    setIsOpen(false);
    if (user?.lockPinEnabled) lock();
    else navigate("/profile");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleDropdown}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-500 text-white font-bold text-xs">
          {initials}
        </span>
        <span className="hidden sm:block text-left px-1">
          <span className="block text-sm font-medium text-gray-800 dark:text-white/90 leading-tight">
            {name}
          </span>
          <span className="block max-w-40 truncate text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
            {roleNames.length === 1 ? roleNames[0] : t("header.roles_count", { count: roleNames.length })}
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 flex w-[240px] flex-col rounded-lg border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 z-50 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <span className="block text-sm font-bold text-gray-800 dark:text-white/90">
              {name}
            </span>
            {email && (
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                {email}
              </span>
            )}
            {/* Server qaysi IP ni ko'ryapti (faqat Super admin - tarmoq cheklovi/nginx sozlamasini tekshirish uchun) */}
            {isSuperAdmin && user?.clientIp && (
              <span className="block text-[11px] text-gray-400 mt-1 font-mono" title={t("header.client_ip_hint")}>
                IP: {user.clientIp}
              </span>
            )}
          </div>
          <ul className="flex flex-col p-2">
            <li>
              <Link
                to="/profile"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
              >
                <User className="w-4 h-4" />
                {t("header.profile")}
              </Link>
            </li>
            <li>
              <button
                onClick={handleLock}
                title={user?.lockPinEnabled ? t("header.lock_now") : t("header.lock_setup_first")}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
              >
                <Lock className="w-4 h-4" />
                {t("header.lock")}
              </button>
            </li>
            <li>
              <Link
                to="/sessions"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
              >
                <History className="w-4 h-4" />
                {t("header.sessions")}
              </Link>
            </li>
          </ul>
          <div className="p-2 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t("header.logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
