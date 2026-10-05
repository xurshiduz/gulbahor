import { evaluateExpression, type ExpressionError } from './expression'
import { Fraction } from './fraction'
import { fractionToMinor, type CurrencyCode } from './money'

export type AmountError = ExpressionError | 'negative' | 'too_large' | 'not_integer'

export type AmountResult =
  { ok: true; minor: number; currency: CurrencyCode | null; isExpression: boolean } | { ok: false; error: AmountError }

/** Largest amount a single field accepts: 1 trillion in major units. */
const MAX_MINOR = 100_000_000_000_000

export interface ParseAmountOptions {
  allowNegative?: boolean
}

/**
 * Reads a money amount the way a cashier types or pastes it and returns
 * minor units. "250k" -> 25 000 000, "1 500 000 - 10%" -> 135 000 000,
 * "$79.05" -> 7 905 with currency USD.
 */
export function parseAmount(input: string, options: ParseAmountOptions = {}): AmountResult {
  const result = evaluateExpression(input)
  if (!result.ok) {
    return result
  }
  if (result.value.isNegative() && !options.allowNegative) {
    return { ok: false, error: 'negative' }
  }
  const scaled = result.value.toScaled(2)
  if (scaled > BigInt(MAX_MINOR) || scaled < -BigInt(MAX_MINOR)) {
    return { ok: false, error: 'too_large' }
  }
  return {
    ok: true,
    minor: fractionToMinor(result.value),
    currency: result.currency,
    isExpression: result.isExpression,
  }
}

export type QuantityResult =
  { ok: true; value: number; text: string; isExpression: boolean } | { ok: false; error: AmountError }

/**
 * Reads a quantity: "5*12" -> 60. Piece goods take whole numbers only;
 * goods sold by weight or length allow up to `decimals` places.
 */
export function parseQuantity(input: string, decimals = 0): QuantityResult {
  const result = evaluateExpression(input)
  if (!result.ok) {
    return result
  }
  if (result.value.isNegative()) {
    return { ok: false, error: 'negative' }
  }
  const scaled = result.value.mul(Fraction.of(10n ** BigInt(decimals)))
  if (!scaled.isInteger()) {
    return { ok: false, error: 'not_integer' }
  }
  const text = result.value.toDecimalString(decimals)
  const value = Number(text)
  if (!Number.isFinite(value) || value > 1_000_000_000) {
    return { ok: false, error: 'too_large' }
  }
  return { ok: true, value, text, isExpression: result.isExpression }
}

export type DiscountResult =
  | { ok: true; kind: 'percent'; percent: string }
  | { ok: true; kind: 'amount'; minor: number }
  /** Not what comes off but what is left: the sum agreed with the customer. */
  | { ok: true; kind: 'target'; minor: number }
  | { ok: false; error: AmountError | 'over_100' }

/** "10%" is a percentage, "50000" or "50k" is an amount, "=1600000" is the sum the whole is brought down to. */
export function parseDiscount(input: string): DiscountResult {
  const trimmed = input.trim()
  if (trimmed.startsWith('=')) {
    const agreed = parseAmount(trimmed.slice(1))
    return agreed.ok ? { ok: true, kind: 'target', minor: agreed.minor } : agreed
  }
  if (trimmed.endsWith('%')) {
    const result = evaluateExpression(trimmed.slice(0, -1))
    if (!result.ok) {
      return result
    }
    if (result.value.isNegative()) {
      return { ok: false, error: 'negative' }
    }
    if (result.value.sub(Fraction.HUNDRED).n > 0n) {
      return { ok: false, error: 'over_100' }
    }
    return { ok: true, kind: 'percent', percent: result.value.toDecimalString(2).replace(/\.?0+$/, '') }
  }
  const amount = parseAmount(trimmed)
  if (!amount.ok) {
    return amount
  }
  return { ok: true, kind: 'amount', minor: amount.minor }
}
