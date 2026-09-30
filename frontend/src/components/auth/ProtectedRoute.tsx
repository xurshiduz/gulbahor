import { Navigate, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import ScreenLock from "./ScreenLock";

export default function ProtectedRoute() {
  const { t } = useTranslation();
  const { token, isLoading, isLocked } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-900">
        <div className="text-gray-500">{t("auth.checking")}</div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/signin" replace />;
  }

  // Blok ekrani sahifa ustiga chiqadi: ish holati (ochiq forma, filtrlar)
  // saqlanib qoladi, PIN kiritilgach o'sha joyidan davom etadi
  return (
    <>
      <Outlet />
      {isLocked && <ScreenLock />}
    </>
  );
}
