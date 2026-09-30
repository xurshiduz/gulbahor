import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';

import translationUZ from './locales/uz/translation.json';
import translationRU from './locales/ru/translation.json';
import translationEN from './locales/en/translation.json';

/**
 * Tizim tillari. Yangi til qo'shish: locales/<kod>/translation.json
 * yarating, shu ro'yxatga va `resources` ga qo'shing - sarlavhadagi til
 * tanlagich (LanguageDropdown) ro'yxatni shu yerdan oladi.
 */
export const LANGUAGES = [
  { code: 'uz', name: "O'zbekcha", dayjs: 'uz-latn' },
  { code: 'ru', name: 'Русский', dayjs: 'ru' },
  { code: 'en', name: 'English', dayjs: 'en' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const LANGUAGE_KEY = 'app_language';
const DEFAULT_LANGUAGE: LanguageCode = 'uz';

const resources = {
  uz: { translation: translationUZ },
  ru: { translation: translationRU },
  en: { translation: translationEN },
};

function readSavedLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved as LanguageCode;
  } catch {
    // localStorage taqiqlangan bo'lsa - standart til
  }
  return DEFAULT_LANGUAGE;
}

/** Til almashganda sana/vaqt matnlari (dayjs) va <html lang> ham ergashadi */
function applyLanguage(code: string) {
  const lang = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
  dayjs.locale(lang.dayjs);
  document.documentElement.lang = lang.code;
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: readSavedLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

applyLanguage(i18n.language);
i18n.on('languageChanged', applyLanguage);

/** Tilni almashtiradi va tanlovni brauzerda saqlaydi */
export function changeLanguage(code: LanguageCode) {
  try {
    localStorage.setItem(LANGUAGE_KEY, code);
  } catch {
    // saqlanmasa ham joriy seansda ishlaydi
  }
  return i18n.changeLanguage(code);
}

export default i18n;
