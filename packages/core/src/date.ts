/** A calendar date without a time or a time zone. */
export interface LocalDate {
  year: number
  month: number
  day: number
}

export type DateResult = { ok: true; date: LocalDate } | { ok: false; error: 'empty' | 'invalid' }

// Single letters also cover the Russian layout: "b" typed there is "и", "k" is "л", "e" is "у".
const TODAY_WORDS = new Set(['b', 'и', 'bugun', 'сегодня', 'today'])
const YESTERDAY_WORDS = new Set(['k', 'л', 'kecha', 'вчера', 'yesterday'])
const TOMORROW_WORDS = new Set(['e', 'у', 'ertaga', 'завтра', 'tomorrow'])

/**
 * Reads a typed date relative to `today`:
 * "b" today, "k" yesterday, "-3" three days ago, "15" the 15th of this
 * month, "1510" 15 October, "151025" and "15.10.2025" full dates,
 * "2025-10-15" ISO.
 */
export function parseDateInput(input: string, today: LocalDate): DateResult {
  const text = input.trim().toLowerCase()
  if (!text) {
    return { ok: false, error: 'empty' }
  }
  if (TODAY_WORDS.has(text)) {
    return { ok: true, date: today }
  }
  if (YESTERDAY_WORDS.has(text)) {
    return { ok: true, date: addDays(today, -1) }
  }
  if (TOMORROW_WORDS.has(text)) {
    return { ok: true, date: addDays(today, 1) }
  }

  const relative = /^([+-])\s*(\d{1,4})$/.exec(text)
  if (relative) {
    const days = Number(relative[2]) * (relative[1] === '-' ? -1 : 1)
    return { ok: true, date: addDays(today, days) }
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (iso) {
    return validated(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }

  const parts = text.split(/[.\-/\s]+/).filter(Boolean)
  if (parts.some((part) => !/^\d+$/.test(part))) {
    return { ok: false, error: 'invalid' }
  }

  if (parts.length === 1) {
    const digits = parts[0]
    switch (digits.length) {
      case 1:
      case 2:
        return validated(today.year, today.month, Number(digits))
      case 3:
        return validated(today.year, Number(digits.slice(1)), Number(digits.slice(0, 1)))
      case 4:
        return validated(today.year, Number(digits.slice(2)), Number(digits.slice(0, 2)))
      case 6:
        return validated(expandYear(digits.slice(4)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)))
      case 8:
        return validated(Number(digits.slice(4)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)))
      default:
        return { ok: false, error: 'invalid' }
    }
  }

  if (parts.length === 2) {
    return validated(today.year, Number(parts[1]), Number(parts[0]))
  }

  if (parts.length === 3) {
    const [day, month, year] = parts
    if (year.length !== 2 && year.length !== 4) {
      return { ok: false, error: 'invalid' }
    }
    return validated(year.length === 2 ? expandYear(year) : Number(year), Number(month), Number(day))
  }

  return { ok: false, error: 'invalid' }
}

function expandYear(twoDigits: string): number {
  return 2000 + Number(twoDigits)
}

function validated(year: number, month: number, day: number): DateResult {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || year < 2000 || year > 2100) {
    return { ok: false, error: 'invalid' }
  }
  return { ok: true, date: { year, month, day } }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

/** { 2025, 10, 5 } -> "2025-10-05" */
export function toIsoDate(date: LocalDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

/** "2025-10-05" -> { 2025, 10, 5 } */
export function fromIsoDate(iso: string): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) {
    return null
  }
  const result = validated(Number(match[1]), Number(match[2]), Number(match[3]))
  return result.ok ? result.date : null
}

/** { 2025, 10, 5 } -> "05.10.2025" */
export function formatDate(date: LocalDate): string {
  return `${pad(date.day)}.${pad(date.month)}.${date.year}`
}

/** Today's date in the given IANA time zone. */
export function todayIn(timeZone = 'Asia/Tashkent', now = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {})
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
