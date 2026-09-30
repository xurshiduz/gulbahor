/** Uch tildagi nom - backenddagi LocalizedName bilan bir xil shakl */
export interface LocalizedName {
  uz: string;
  ru: string;
  en?: string | null;
}

export const EMPTY_LOCALIZED: LocalizedName = { uz: "", ru: "", en: "" };

/**
 * Nomni tanlangan tilda qaytaradi. O'sha tilda yozilmagan bo'lsa (masalan
 * inglizchasi bo'sh) - o'zbekcha, keyin ruscha nomga qaytadi.
 */
export function localized(name: LocalizedName | null | undefined, language: string): string {
  if (!name) return "";
  const values = name as unknown as Record<string, string | null | undefined>;
  return values[language] || name.uz || name.ru || name.en || "";
}

/** Qidiruv uchun: uchala tildagi nom bitta satrda */
export function localizedSearch(name: LocalizedName | null | undefined): string {
  if (!name) return "";
  return [name.uz, name.ru, name.en].filter(Boolean).join(" ");
}
