import React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Languages, LockKeyhole, ShieldCheck } from "lucide-react";
import GridShape from "../../components/common/GridShape";
import ThemeTogglerTwo from "../../components/common/ThemeTogglerTwo";
import LanguageDropdown from "../../components/header/LanguageDropdown";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  const features = [
    { icon: <ShieldCheck className="h-4 w-4" />, text: t("auth.feature_roles") },
    { icon: <LockKeyhole className="h-4 w-4" />, text: t("auth.feature_security") },
    { icon: <Languages className="h-4 w-4" />, text: t("auth.feature_languages") },
  ];

  // Tashqi konteynerda faqat yon tomondan bo'shliq: vertikal padding
  // min-h-screen ustiga qo'shilib, telefonda ortiqcha skrol hosil qilardi.
  // Yuqoridagi bo'shliqni forma o'zi (pt-6) beradi.
  return (
    <div className="relative px-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      {/* Til tanlash - kirishdan oldin ham kerak */}
      <div className="absolute left-4 top-4 z-50 lg:left-6 lg:top-6">
        <LanguageDropdown align="left" />
      </div>

      {/*
        Telefonda min-h-screen: qat'iy h-screen bo'lganda kontent ekrandan
        uzun bo'lsa (tablar + forma) sig'masdi va sahifani siljitishga
        to'g'ri kelardi.

        Katta ekranda esa h-screen qaytariladi: o'ngdagi panel h-full
        (height: 100%) ishlatadi, u esa ota elementda ANIQ balandlik
        bo'lishini talab qiladi.
      */}
      <div className="relative flex flex-col justify-center w-full min-h-screen lg:h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}
        <div className="items-center hidden w-full h-full lg:w-1/2 bg-brand-950 dark:bg-white/5 lg:grid">
          <div className="relative flex items-center justify-center z-1">
            <GridShape />
            <div className="flex flex-col items-center max-w-md px-6">
              <Link to="/" className="block mb-8">
                <img src="/images/logo/logo-dark.svg" alt="Gulbahor" className="h-14 w-auto" />
              </Link>

              <h2 className="text-center text-xl font-semibold text-white">
                {t("auth.hero_title")}
              </h2>
              <p className="mt-2.5 text-center text-sm leading-relaxed text-gray-400 dark:text-white/60">
                {t("auth.hero_subtitle")}
              </p>

              <ul className="mt-8 w-full space-y-2.5">
                {features.map((feature) => (
                  <li
                    key={feature.text}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400">
                      {feature.icon}
                    </span>
                    {feature.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="fixed z-50 hidden bottom-6 right-6 sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
