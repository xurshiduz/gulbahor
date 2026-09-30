import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, Undo2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { clearImpersonator, readImpersonator, type Saved } from "../../utils/impersonation";

/** Sahifa tepasidagi sariq chiziq: kim nomidan kirilgani va orqaga qaytish */
export default function ImpersonationBanner() {
  const { t } = useTranslation();
  const { user, login, token } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<Saved | null>(readImpersonator);

  // Boshqa joyda (masalan Foydalanuvchilar sahifasida) kirilganda yangilanadi
  useEffect(() => {
    setSaved(readImpersonator());
  }, [token]);

  if (!saved || !user || saved.user?.id === user.id) return null;

  const back = async () => {
    // Xodim nomidan ochilgan seans yopiladi - kirish tarixida "faol" bo'lib qolmasin
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // yopilmasa ham admin seansiga qaytamiz
    }
    clearImpersonator();
    login(saved.token, saved.user);
    setSaved(null);
    navigate("/users");
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
      <Eye className="h-4 w-4" />
      <span>
        {t("impersonation.banner", {
          name: user.name || user.username,
          admin: saved.user?.name || saved.user?.username,
        })}
      </span>
      <button onClick={back} className="inline-flex items-center gap-1 rounded-md bg-amber-950 px-2.5 py-1 text-amber-50 hover:bg-amber-900 transition">
        <Undo2 className="h-3.5 w-3.5" /> {t("impersonation.back")}
      </button>
    </div>
  );
}
