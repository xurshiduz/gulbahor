import { ALL_CURRENCY_CODES, type AnyCurrency } from './money'

/**
 * What a bank's Telegram bot writes to a card's owner when money moves on the
 * card (REJA, 6-bo'lim): HumoBot and CardXabarBot say the same things two
 * ways, and a third bot will find a third. One reader takes them all by what
 * marks each line, not by where the line stands — the sign before the sum, the
 * card, the clock, the money bag before what is left — and reads sums straight
 * into minor units, never through a float.
 *
 * What it cannot read it does not guess at: a notice with no sum, or one that
 * does not say which way the money went, comes back null and is kept as it
 * was written for a person to look at.
 */

export interface BankMove {
  kind: 'move'
  direction: 'in' | 'out'
  /** Minor units. */
  amount: number
  currency: AnyCurrency
  /** The bank's own heading without its mark: "To'ldirish", "E-Com oplata". */
  heading: string | null
  /** Where the money came from or went: "PAYME P2P H2H>TASHKENT", "UZMOBILE GSM CLICK, UZ". */
  place: string | null
  /** The card's last four digits, as the bank shows them. */
  cardTail: string | null
  /** When, by the bank's clock, as written: "2026-09-15T17:46". No zone: the bank's clock is Tashkent's. */
  at: string | null
  /** What is left on the card after it, minor units. */
  balance: number | null
}

/** What the bot answers when the owner asks what a card holds: no money moved. */
export interface BankBalance {
  kind: 'balance'
  cardTail: string | null
  balance: number
  currency: AnyCurrency
}

export type BankNotice = BankMove | BankBalance

const PLUS = '\u{2795}'
const MINUS = '\u{2796}'
const GREEN = '\u{1F7E2}'
const RED = '\u{1F534}'

/** The marks a bank puts before the sum, the place, the card, the time and what is left: a notice sent as one line is cut at them. */
const FIELD_MARKS = /\s*([\u{2795}\u{2796}\u{1F4CD}\u{1F4B3}\u{1F4B0}\u{1F4B5}\u{23F0}\u{1F550}-\u{1F567}])/gu

/** What is left on the card is marked with a money bag, or with a banknote. */
const BALANCE_MARK = /^[\u{1F4B0}\u{1F4B5}]/u
const PLACE_MARK = /^\u{1F4CD}/u
const CARD_MARK = /^\u{1F4B3}/u

/** A masked card number: the surest sign that this is a bank's notice at all. */
const CARD_MASK = /\*+\s?(\d{4})(?!\d)/

const CURRENCY_WORDS: [RegExp, AnyCurrency][] = [
  [/^(?:сум|сўм|sum|so\s*['ʻ‘’`]?\s*m)$/i, 'UZS'],
  [/^\$$/, 'USD'],
]
const CODES = ALL_CURRENCY_CODES.join('|')
/** A figure with what it is in after it, which is how every sum is written. */
const SUM = new RegExp(
  `(\\d[\\d.,'’\`\\s\\u00a0]*)\\s*(${CODES}|сум|сўм|sum|so\\s*['ʻ‘’\`]?\\s*m|\\$)(?![\\p{L}])`,
  'iu',
)

/**
 * Words in a heading that say money came, and that it went — in Uzbek, Russian (either alphabet) and English,
 * since a bot writes in the language its owner chose. Read only where no sign says so: a heading may change
 * with the language, the sign before the sum does not.
 */
const CAME =
  /to\s*['ʻ‘’`]?\s*ldirish|hisobi\s+o\s*['ʻ‘’`]?\s*zgardi|kirim|tushum|popolnen|пополнен|zachislen|зачислен|perevod\s+na\s+kartu|перевод\s+на\s+карту|top\s*-?\s*up|deposit|credit(?!\s*card)|received|income/i
const WENT =
  /to\s*['ʻ‘’`]?\s*lov|yechish|chiqim|xarid|oplata|оплата|spisani|списани|snyati|сняти|pokupka|покупка|perevod\s+s\s+kart|перевод\s+с\s+карт|payment|purchase|withdraw|debit/i

/**
 * A sum as a bank writes it, in minor units: "375.000,00", "40 000.00", "33'195'624.29", "125.000". The last
 * dot or comma with one or two digits after it is where the tiyin begin; every other mark only groups thousands.
 */
export function readBankSum(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '')
  if (!/\d/.test(cleaned)) {
    return null
  }
  const fraction = /[.,](\d{1,2})$/.exec(cleaned)
  const whole = (fraction ? cleaned.slice(0, -fraction[0].length) : cleaned).replace(/[.,]/g, '')
  const minor = Number(whole || '0') * 100 + (fraction ? Number(fraction[1].padEnd(2, '0')) : 0)
  return Number.isSafeInteger(minor) ? minor : null
}

function currencyOf(word: string): AnyCurrency | null {
  const code = word.toUpperCase() as AnyCurrency
  if (ALL_CURRENCY_CODES.includes(code)) {
    return code
  }
  return CURRENCY_WORDS.find(([pattern]) => pattern.test(word.trim()))?.[1] ?? null
}

function sumOf(line: string | undefined): { amount: number; currency: AnyCurrency } | null {
  const found = line ? SUM.exec(line) : null
  const amount = found ? readBankSum(found[1]) : null
  const currency = found ? currencyOf(found[2]) : null
  return amount !== null && currency ? { amount, currency } : null
}

/** "17:46 15.09.2026" and "16.02.25 13:53" alike, as "2026-09-15T17:46". */
function stampOf(line: string): string | null {
  const found =
    /(?<time>\d{1,2}:\d{2})\s+(?<date>\d{1,2}\.\d{1,2}\.\d{2,4})/.exec(line) ??
    /(?<date>\d{1,2}\.\d{1,2}\.\d{2,4})\s+(?<time>\d{1,2}:\d{2})/.exec(line)
  if (!found?.groups) {
    return null
  }
  const [hour, minute] = found.groups.time.split(':').map(Number)
  const [day, month, written] = found.groups.date.split('.').map(Number)
  const year = written < 100 ? 2000 + written : written
  if (!day || day > 31 || !month || month > 12 || hour > 23 || minute > 59) {
    return null
  }
  const two = (value: number) => String(value).padStart(2, '0')
  return `${year}-${two(month)}-${two(day)}T${two(hour)}:${two(minute)}`
}

/** A line without the mark it opens with. Some marks are letters to Unicode (ℹ): only an alphabet's letters count. */
const unmarked = (line: string) => line.replace(/^[^\p{Script=Latin}\p{Script=Cyrillic}\d*]+/u, '').trim() || null

/**
 * Reads one message of a bank's bot. Null for what is not a notice — and for a notice that cannot be read
 * surely: no sum, or nothing that says whether the money came or went.
 */
export function parseBankNotice(text: string): BankNotice | null {
  const lines = text
    .replace(FIELD_MARKS, '\n$1')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) {
    return null
  }
  const [first] = lines
  const balanceLine = lines.find((line) => BALANCE_MARK.test(line))
  const signed = lines.find((line) => line.startsWith(PLUS) || line.startsWith(MINUS))
  // The sum is on the line with the sign; a notice without one has it on the first line after the heading
  // that holds a figure with its currency. What is left on the card is marked, and never taken for it.
  const amountLine = signed ?? lines.find((line) => line !== balanceLine && line !== first && SUM.test(line))
  const cardLine = lines.find((line) => CARD_MARK.test(line)) ?? lines.find((line) => CARD_MASK.test(line))
  const cardTail = cardLine ? (CARD_MASK.exec(cardLine)?.[1] ?? null) : null
  const stampLine = lines.find((line) => stampOf(line) !== null)
  const left = sumOf(balanceLine)

  // The card and what it holds, with neither a sign nor a time: the answer to "what is on the card".
  if (!signed && !stampLine && left && CARD_MASK.test(first) && (!amountLine || amountLine === balanceLine)) {
    return { kind: 'balance', cardTail, balance: left.amount, currency: left.currency }
  }

  const sum = sumOf(amountLine)
  if (!sum || !sum.amount) {
    return null
  }
  const heading = first === amountLine ? null : first
  const direction = signed
    ? signed.startsWith(PLUS)
      ? 'in'
      : 'out'
    : heading?.startsWith(GREEN)
      ? 'in'
      : heading?.startsWith(RED)
        ? 'out'
        : heading && CAME.test(heading)
          ? 'in'
          : heading && WENT.test(heading)
            ? 'out'
            : null
  if (!direction) {
    return null
  }

  // The place is marked; where it is not, it is whatever line is left over with no sum on it.
  const used = new Set([heading, amountLine, cardLine, stampLine, balanceLine])
  const placeLine =
    lines.find((line) => PLACE_MARK.test(line)) ?? lines.find((line) => !used.has(line) && !SUM.test(line))

  return {
    kind: 'move',
    direction,
    amount: sum.amount,
    currency: sum.currency,
    heading: heading ? unmarked(heading) : null,
    place: placeLine ? unmarked(placeLine) : null,
    cardTail,
    at: stampLine ? stampOf(stampLine) : null,
    balance: left && left.currency === sum.currency ? left.amount : null,
  }
}

/**
 * Whether one notice follows another on the same card with nothing missing between them: what was left after
 * the first, with the second's sum added or taken, is what is left after the second. Null where either does not
 * say what is left — nothing can be told.
 */
export function followsOn(
  earlier: Pick<BankMove, 'balance'>,
  later: Pick<BankMove, 'balance' | 'direction' | 'amount'>,
) {
  if (earlier.balance === null || later.balance === null) {
    return null
  }
  return earlier.balance + (later.direction === 'in' ? later.amount : -later.amount) === later.balance
}
