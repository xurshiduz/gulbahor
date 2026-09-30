import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";
import { useAuth } from "../../context/AuthContext";

export default function SignIn() {
  const { t } = useTranslation();
  const { token, isLoading } = useAuth();

  // Allaqachon kirgan foydalanuvchi kirish sahifasida qolmaydi
  if (token && !isLoading) return <Navigate to="/" replace />;

  return (
    <>
      <PageMeta title={`${t("auth.login")} | Gulbahor`} description={t("auth.sign_in_to_account")} />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
