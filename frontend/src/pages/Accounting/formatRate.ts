const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });

/** Kursni o'qishga qulay ko'rinishda: 12650.5 -> "12 650,5" */
export function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatter.format(value);
}
