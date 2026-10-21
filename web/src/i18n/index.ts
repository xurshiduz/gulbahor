import { LANGUAGES, type Language } from '@erp/core'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { cyrillicOf } from './cyrillic'
import { en } from './en'
import { ru } from './ru'
import { uz } from './uz'

const STORAGE_KEY = 'gb.language'
/** Set when the language was picked on the sign-in screen: the person signing in takes it with them. */
const PICKED_KEY = 'gb.language.picked'

function storedLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.find((language) => language === stored) ?? 'uz'
  } catch {
    return 'uz'
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    'uz-Cyrl': { translation: cyrillicOf(uz) },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: storedLanguage(),
  fallbackLng: 'uz',
  interpolation: { escapeValue: false },
  returnNull: false,
})

/** The language is the person's setting; it is also kept locally so the sign-in screen speaks it. */
export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Private windows may refuse storage; the language still changes for this visit.
  }
  document.documentElement.lang = language
  void i18n.changeLanguage(language)
}

/** Picked before signing in: kept, so it becomes the person's own once they are in. */
export function pickLanguage(language: Language) {
  setLanguage(language)
  try {
    localStorage.setItem(PICKED_KEY, '1')
  } catch {
    // Without storage the picked language still holds until the session sets the person's own.
  }
}

/** The language picked on the sign-in screen, once: null when none was. */
export function takePickedLanguage(): Language | null {
  try {
    if (localStorage.getItem(PICKED_KEY) !== '1') {
      return null
    }
    localStorage.removeItem(PICKED_KEY)
    return storedLanguage()
  } catch {
    return null
  }
}

export { i18n }
