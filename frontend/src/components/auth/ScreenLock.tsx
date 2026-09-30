import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import PinInput from "../common/PinInput";

/**
 * Avtobloklash ekrani.
 *
 * Profilda PIN o'rnatilgan bo'lsa, belgilangan daqiqadan keyin butun ilova
 * ustiga shu oyna chiqadi. Sessiya yopilmaydi - to'g'ri PIN kiritilsa ish
 * o'sha joyidan davom etadi. PIN esdan chiqqan bo'lsa "Chiqib, qayta kirish"
 * tugmasi login-parol sahifasiga olib boradi.
 */
export default function ScreenLock() {
  const { t } = useTranslation();
  const { user, token, unlock, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const verify = async (candidate: string) => {
    if (isChecking) return;
    setIsChecking(true);
    setError("");

    try {
      const res = await fetch("/api/auth/lock-pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin: candidate }),
      });

      if (res.ok) {
        setPin("");
        unlock();
        return;
      }

      // Sessiyaning o'zi tugagan bo'lsa PIN yordam bermaydi
      if (res.status === 401) {
        const body = await res.json().catch(() => null);
        if (body?.message && String(body.message).includes('PIN')) {
          setError(t("lock.wrong_pin"));
        } else {
          await logout();
          return;
        }
      } else {
        setError(t("lock.check_error"));
      }
      setPin("");
    } catch {
      setError(t("common.server_unreachable"));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl dark:bg-gray-900">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            <Lock className="h-7 w-7" />
          </div>

          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("lock.title")}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {user?.name ? t("lock.enter_pin_named", { name: user.name }) : t("lock.enter_pin")}
          </p>

          <div className="mt-6">
            <PinInput
              masked
              value={pin}
              onChange={(next) => { setPin(next); if (error) setError(""); }}
              onComplete={verify}
              autoFocus
              disabled={isChecking}
              invalid={!!error}
            />
          </div>

          <p className={`mt-3 h-5 text-sm font-medium ${error ? "text-red-500" : "text-gray-400"}`}>
            {error || (isChecking ? t("lock.checking") : "")}
          </p>

          <hr className="my-5 w-full border-gray-200 dark:border-gray-700" />

          <p className="text-xs text-gray-500 dark:text-gray-400">{t("lock.forgot")}</p>
          <button
            onClick={() => logout()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <LogOut className="h-4 w-4" />
            {t("lock.relogin")}
          </button>
        </div>
      </div>
    </div>
  );
}
