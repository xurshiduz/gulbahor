const TIME_ZONE = 'Asia/Tashkent'

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateOnly = new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' })
const timeOnly = new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })

/** "01.10.2026 14:05" */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)).replace(',', '') : '—'
}

/** "01.10.2026" */
export function formatDay(iso: string | null | undefined): string {
  return iso ? dateOnly.format(new Date(iso)) : '—'
}

/** Today shows only the time; other days show the date as well. */
export function formatRecent(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  return dateOnly.format(date) === dateOnly.format(new Date()) ? timeOnly.format(date) : dateTime.format(date).replace(',', '')
}

/** 1250000 -> "1 250 000" */
export function formatNumber(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** "+998901234567" -> "+998 90 123 45 67" */
export function formatPhone(e164: string | null | undefined): string {
  const digits = (e164 ?? '').replace(/\D/g, '')
  if (digits.length !== 12) {
    return e164 ?? '—'
  }
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`
}
