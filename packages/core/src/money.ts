import { Fraction } from './fraction'

/**
 * Money is stored and moved as an integer count of minor units: tiyin for
 * so'm, cents for dollars. Every currency here has two minor digits.
 */

/** What the business keeps its own money and prices in. */
export type CurrencyCode = 'UZS' | 'USD'

/** Those, and what suppliers abroad are paid in. A purchase is converted to dollars and so'm when it is received. */
export type AnyCurrency = CurrencyCode | 'CNY' | 'KGS' | 'TRY' | 'RUB' | 'KZT' | 'EUR' | 'AED'

export interface CurrencyInfo {
  code: AnyCurrency
  minorDigits: 2
  symbol: string
  name: string
  /** Whether the minor part is worth showing when it is zero. */
  alwaysShowMinor: boolean
}

export const CURRENCIES: Record<AnyCurrency, CurrencyInfo> = {
  UZS: { code: 'UZS', minorDigits: 2, symbol: "so'm", name: "O'zbek so'mi", alwaysShowMinor: false },
  USD: { code: 'USD', minorDigits: 2, symbol: '$', name: 'AQSH dollari', alwaysShowMinor: true },
  CNY: { code: 'CNY', minorDigits: 2, symbol: '¥', name: 'Xitoy yuani', alwaysShowMinor: true },
  KGS: { code: 'KGS', minorDigits: 2, symbol: 'KGS', name: "Qirg'iz somi", alwaysShowMinor: false },
  TRY: { code: 'TRY', minorDigits: 2, symbol: '₺', name: 'Turk lirasi', alwaysShowMinor: true },
  RUB: { code: 'RUB', minorDigits: 2, symbol: '₽', name: 'Rossiya rubli', alwaysShowMinor: false },
  KZT: { code: 'KZT', minorDigits: 2, symbol: '₸', name: "Qozog'iston tengesi", alwaysShowMinor: false },
  EUR: { code: 'EUR', minorDigits: 2, symbol: '€', name: 'Yevro', alwaysShowMinor: true },
  AED: { code: 'AED', minorDigits: 2, symbol: 'AED', name: 'BAA dirhami', alwaysShowMinor: true },
}

export const CURRENCY_CODES: CurrencyCode[] = ['UZS', 'USD']

export const ALL_CURRENCY_CODES = Object.keys(CURRENCIES) as AnyCurrency[]

const MINOR_SCALE = 2

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return value === 'UZS' || value === 'USD'
}

export function assertMinor(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Minor units must be a safe integer, got ${value}`)
  }
  return value
}

export function fractionToMinor(value: Fraction): number {
  return assertMinor(Number(value.toScaled(MINOR_SCALE)))
}

export function minorToFraction(minor: number): Fraction {
  return Fraction.of(assertMinor(minor), 100)
}

/** "1250.5" -> 125050 */
export function toMinor(major: string): number {
  return fractionToMinor(Fraction.parse(major))
}

/** 125050 -> "1250.50" */
export function toMajorString(minor: number): string {
  return minorToFraction(minor).toDecimalString(MINOR_SCALE)
}

export function sumMinor(values: readonly number[]): number {
  return assertMinor(values.reduce((total, value) => total + assertMinor(value), 0))
}

/**
 * Splits `total` across `weights` so the parts add up to `total` exactly.
 * Each part gets its floor share; the leftover minor units go to the parts
 * with the largest remainders (earlier parts win ties). Weights may be
 * fractional (kilograms, for example) and are kept to six decimals.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  return allocateExact(
    total,
    weights.map((weight) => {
      if (!(weight >= 0)) {
        throw new RangeError(`Weights must be non-negative, got ${weight}`)
      }
      return BigInt(Math.round(weight * 1_000_000))
    }),
  )
}

/** `allocate` for weights that are already whole numbers of any size, such as amounts in minor units. */
export function allocateExact(total: number, scaled: readonly bigint[]): number[] {
  assertMinor(total)
  if (!scaled.length) {
    return []
  }
  if (scaled.some((weight) => weight < 0n)) {
    throw new RangeError('Weights must be non-negative')
  }

  let sum = scaled.reduce((acc, weight) => acc + weight, 0n)
  const effective = sum === 0n ? scaled.map(() => 1n) : scaled
  if (sum === 0n) {
    sum = BigInt(scaled.length)
  }

  const sign = total < 0 ? -1n : 1n
  const amount = BigInt(total) * sign
  const parts = effective.map((weight) => (amount * weight) / sum)
  const remainders = effective.map((weight, index) => ({ index, rest: (amount * weight) % sum }))

  let leftover = amount - parts.reduce((acc, part) => acc + part, 0n)
  remainders.sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1))
  for (const { index } of remainders) {
    if (leftover <= 0n) {
      break
    }
    parts[index] += 1n
    leftover -= 1n
  }

  return parts.map((part) => Number(part * sign))
}

/** `percent` of `minor`, rounded half away from zero. */
export function percentOf(minor: number, percent: string | number): number {
  const rate = typeof percent === 'number' ? Fraction.parse(String(percent)) : Fraction.parse(percent)
  return fractionToMinor(minorToFraction(minor).mul(rate).div(Fraction.HUNDRED))
}

export type RoundingMode = 'nearest' | 'up' | 'down'

/** Rounds to a cash step such as 1 000 so'm (step given in minor units). */
export function roundToStep(minor: number, stepMinor: number, mode: RoundingMode = 'nearest'): number {
  assertMinor(minor)
  if (stepMinor <= 0) {
    return minor
  }
  const floor = Math.floor(minor / stepMinor) * stepMinor
  if (floor === minor) {
    return minor
  }
  if (mode === 'down') {
    return floor
  }
  if (mode === 'up') {
    return floor + stepMinor
  }
  return minor - floor >= stepMinor / 2 ? floor + stepMinor : floor
}

/** A rate is how many so'm one dollar costs, written as a decimal such as "11821.18". */
export function parseRate(rate: string): Fraction {
  const value = Fraction.parse(rate)
  if (value.isNegative() || value.isZero()) {
    throw new RangeError(`Rate must be positive, got ${rate}`)
  }
  return value
}

/**
 * Converts an amount between so'm and dollars with a so'm-per-dollar rate.
 * The result is rounded once, half away from zero, to minor units.
 */
export function convert(minor: number, from: CurrencyCode, to: CurrencyCode, uzsPerUsd: string): number {
  assertMinor(minor)
  if (from === to) {
    return minor
  }
  const rate = parseRate(uzsPerUsd)
  const amount = Fraction.of(minor)
  if (from === 'USD' && to === 'UZS') {
    return assertMinor(Number(amount.mul(rate).toScaled(0)))
  }
  return assertMinor(Number(amount.div(rate).toScaled(0)))
}

export interface FormatMoneyOptions {
  /** Append the currency symbol. Default true. */
  symbol?: boolean
  /** Group separator. Default a no-break space so amounts never wrap. */
  group?: string
  /** Show the minor part even when it is zero. Default depends on the currency. */
  minor?: 'auto' | 'always' | 'never'
}

/** 125000050 UZS -> "1 250 000,50 so'm"; 7905 USD -> "79,05 $" */
export function formatMoney(minor: number, currency: AnyCurrency = 'UZS', options: FormatMoneyOptions = {}): string {
  const { symbol = true, group = ' ', minor: minorMode = 'auto' } = options
  const info = CURRENCIES[currency]
  const negative = minor < 0
  const abs = Math.abs(assertMinor(minor))
  const whole = Math.floor(abs / 100)
  const cents = abs % 100
  const showMinor = minorMode === 'always' || (minorMode === 'auto' && (info.alwaysShowMinor || cents !== 0))
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, group)
  const text = `${negative ? '−' : ''}${grouped}${showMinor ? `,${String(cents).padStart(2, '0')}` : ''}`
  return symbol ? `${text} ${info.symbol}` : text
}
