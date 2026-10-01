import { Fraction } from './fraction'
import type { CurrencyCode } from './money'

/**
 * Reads what people actually type into a number field: "1 250 000",
 * "1.250.000", "$1,250.50", "250k", "1,5 mln", "120000*3",
 * "1 500 000 - 10%". Everything is evaluated exactly, as fractions.
 */

export type ExpressionResult =
  | { ok: true; value: Fraction; currency: CurrencyCode | null; isExpression: boolean }
  | { ok: false; error: ExpressionError }

export type ExpressionError = 'empty' | 'invalid' | 'currency_conflict' | 'division_by_zero'

const SPACES = /[\s    ]/
const GROUP_APOSTROPHE = /['’`]/

const CURRENCY_MARKERS: { pattern: RegExp; code: CurrencyCode }[] = [
  { pattern: /\$|\busd\b|\bdollar\w*|долл\w*|доллар\w*/giu, code: 'USD' },
  { pattern: /so['‘’ʻ`]?m\b|\bsum\b|\bsom\b|сум\w*|сўм\w*|\buzs\b/giu, code: 'UZS' },
]

const SUFFIXES: { pattern: RegExp; factor: bigint }[] = [
  { pattern: /^(mlrd|млрд)/iu, factor: 1_000_000_000n },
  { pattern: /^(mln|млн|m|м)(?![a-zа-я])/iu, factor: 1_000_000n },
  { pattern: /^(ming|тыс|k|к)(?![a-zа-я])/iu, factor: 1_000n },
]

type Token =
  | { kind: 'num'; value: Fraction }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'pct' }
  | { kind: 'lp' }
  | { kind: 'rp' }

export function evaluateExpression(input: string): ExpressionResult {
  let text = input.trim()
  if (!text) {
    return { ok: false, error: 'empty' }
  }

  let currency: CurrencyCode | null = null
  for (const marker of CURRENCY_MARKERS) {
    if (marker.pattern.test(text)) {
      if (currency && currency !== marker.code) {
        return { ok: false, error: 'currency_conflict' }
      }
      currency = marker.code
      text = text.replace(marker.pattern, ' ')
    }
    marker.pattern.lastIndex = 0
  }

  const tokens = tokenize(text)
  if (!tokens) {
    return { ok: false, error: 'invalid' }
  }
  if (!tokens.length) {
    return { ok: false, error: 'empty' }
  }

  try {
    const parser = new Parser(tokens)
    const result = parser.parse()
    const isExpression = tokens.some((token) => token.kind !== 'num')
    return { ok: true, value: result, currency, isExpression }
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false, error: 'division_by_zero' }
    }
    return { ok: false, error: 'invalid' }
  }
}

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (SPACES.test(char)) {
      i++
      continue
    }
    if (/\d/.test(char) || ((char === '.' || char === ',') && /\d/.test(text[i + 1] ?? ''))) {
      const { raw, next } = readNumber(text, i)
      const value = interpretNumber(raw)
      if (!value) {
        return null
      }
      const { factor, next: afterSuffix } = readSuffix(text, next)
      tokens.push({ kind: 'num', value: value.mul(Fraction.of(factor)) })
      i = afterSuffix
      continue
    }
    if (char === '+') tokens.push({ kind: 'op', value: '+' })
    else if (char === '-' || char === '−' || char === '–') tokens.push({ kind: 'op', value: '-' })
    else if (char === '*' || char === '×' || char === 'x' || char === 'X' || char === 'х' || char === 'Х')
      tokens.push({ kind: 'op', value: '*' })
    else if (char === '/' || char === '÷' || char === ':') tokens.push({ kind: 'op', value: '/' })
    else if (char === '%') tokens.push({ kind: 'pct' })
    else if (char === '(') tokens.push({ kind: 'lp' })
    else if (char === ')') tokens.push({ kind: 'rp' })
    else if (char === '=' && i === text.length - 1) {
      // A trailing "=" is how people finish a calculation.
    } else return null
    i++
  }
  return tokens
}

/** Digits with separators inside them: spaces, dots, commas, apostrophes. */
function readNumber(text: string, start: number): { raw: string; next: number } {
  let i = start
  let raw = ''
  while (i < text.length) {
    const char = text[i]
    if (/\d/.test(char)) {
      raw += char
      i++
      continue
    }
    const isSeparator = char === '.' || char === ',' || SPACES.test(char) || GROUP_APOSTROPHE.test(char)
    if (isSeparator && /\d/.test(text[i + 1] ?? '')) {
      raw += SPACES.test(char) || GROUP_APOSTROPHE.test(char) ? ' ' : char
      i++
      continue
    }
    break
  }
  return { raw, next: i }
}

function readSuffix(text: string, start: number): { factor: bigint; next: number } {
  let i = start
  while (i < text.length && SPACES.test(text[i])) {
    i++
  }
  const rest = text.slice(i)
  for (const suffix of SUFFIXES) {
    const match = suffix.pattern.exec(rest)
    if (match) {
      return { factor: suffix.factor, next: i + match[0].length }
    }
  }
  return { factor: 1n, next: start }
}

/**
 * Decides which separator marks the fraction:
 * - spaces and apostrophes always group thousands;
 * - with both "." and ",", the last one is the decimal mark;
 * - a single "." or "," followed by exactly three digits groups thousands
 *   ("1.250" is 1 250), unless the whole part is 0 ("0,125");
 * - a mark that repeats groups thousands ("1.250.000").
 */
function interpretNumber(raw: string): Fraction | null {
  const compact = raw.replace(/ /g, '')
  const dots = (compact.match(/\./g) ?? []).length
  const commas = (compact.match(/,/g) ?? []).length

  let decimalMark: '.' | ',' | null = null
  if (dots && commas) {
    decimalMark = compact.lastIndexOf('.') > compact.lastIndexOf(',') ? '.' : ','
    if ((decimalMark === '.' ? dots : commas) > 1) {
      return null
    }
  } else if (dots === 1 || commas === 1) {
    const mark = dots ? '.' : ','
    const [whole, fraction] = compact.split(mark)
    const looksGrouped = fraction.length === 3 && whole.length <= 3 && whole !== '0' && whole !== ''
    decimalMark = looksGrouped ? null : mark
  }

  let digits = compact
  if (decimalMark) {
    const index = compact.lastIndexOf(decimalMark)
    const whole = compact.slice(0, index).replace(/[.,]/g, '')
    const fraction = compact.slice(index + 1)
    digits = `${whole || '0'}.${fraction}`
  } else {
    digits = compact.replace(/[.,]/g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(digits)) {
    return null
  }
  return Fraction.parse(digits)
}

interface Operand {
  value: Fraction
  percent: boolean
}

class Parser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): Fraction {
    const result = this.additive()
    if (this.index !== this.tokens.length) {
      throw new SyntaxError('Unexpected token')
    }
    return result.percent ? result.value.div(Fraction.HUNDRED) : result.value
  }

  /** a ± b% means a ± a·b/100, the way a calculator does it. */
  private additive(): Operand {
    let left = this.multiplicative()
    while (this.peekOp('+') || this.peekOp('-')) {
      const op = (this.tokens[this.index++] as { value: '+' | '-' }).value
      const right = this.multiplicative()
      const base = resolve(left)
      const delta = right.percent ? base.mul(right.value).div(Fraction.HUNDRED) : right.value
      left = { value: op === '+' ? base.add(delta) : base.sub(delta), percent: false }
    }
    return left
  }

  private multiplicative(): Operand {
    let left = this.unary()
    while (this.peekOp('*') || this.peekOp('/')) {
      const op = (this.tokens[this.index++] as { value: '*' | '/' }).value
      const right = this.unary()
      const divisor = resolve(right)
      left = {
        value: op === '*' ? resolve(left).mul(divisor) : resolve(left).div(divisor),
        percent: false,
      }
    }
    return left
  }

  private unary(): Operand {
    if (this.peekOp('-')) {
      this.index++
      const operand = this.unary()
      return { value: operand.value.neg(), percent: operand.percent }
    }
    if (this.peekOp('+')) {
      this.index++
      return this.unary()
    }
    return this.postfix()
  }

  private postfix(): Operand {
    const primary = this.primary()
    if (this.tokens[this.index]?.kind === 'pct') {
      this.index++
      return { value: primary.value, percent: true }
    }
    return primary
  }

  private primary(): Operand {
    const token = this.tokens[this.index++]
    if (!token) {
      throw new SyntaxError('Unexpected end')
    }
    if (token.kind === 'num') {
      return { value: token.value, percent: false }
    }
    if (token.kind === 'lp') {
      const inner = this.additive()
      if (this.tokens[this.index++]?.kind !== 'rp') {
        throw new SyntaxError('Missing )')
      }
      return { value: resolve(inner), percent: false }
    }
    throw new SyntaxError('Unexpected token')
  }

  private peekOp(op: string): boolean {
    const token = this.tokens[this.index]
    return token?.kind === 'op' && token.value === op
  }
}

function resolve(operand: Operand): Fraction {
  return operand.percent ? operand.value.div(Fraction.HUNDRED) : operand.value
}
