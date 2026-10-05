import {
  belowFloor,
  floorOf,
  formatMoney,
  gross,
  parseDiscount,
  percentOf,
  returnShare,
  roundToStep,
  saleTotals,
  type CurrencyCode,
  type PosContextDto,
  type PosItemDto,
  type ReturnableDto,
  type SaleLineDto,
  type SaleTotals,
  type TenderMethod,
} from '@gulbahor/core'

import { uuid } from '@/lib/uuid'

/** One line of the cart: a thing, how many, and what is taken off as the cashier typed it ("10%", "5000"). */
export interface CartLine {
  key: string
  item: PosItemDto
  qty: number
  discountText: string
}

/** One way money changes hands: the customer paying, or being paid back. */
export interface TenderRow {
  key: string
  method: TenderMethod
  currency: CurrencyCode
  /** The card or terminal; null for cash. */
  accountId: string | null
  amount: number | null
  /** Dollars taken for an agreed worth in so'm: "call the 50 dollars 600 000". Null: what the rate makes them. */
  value: number | null
  reference: string
}

export interface Cart {
  lines: CartLine[]
  /** Off the whole sale: "5%" or a sum. */
  discountText: string
  sellerId: string | null
}

export const EMPTY_CART: Cart = { lines: [], discountText: '', sellerId: null }

/**
 * What "10%", "5000" or "=90000" takes off `base`, in tiyin; nothing for what
 * cannot be read. "=" names the sum agreed on: what comes off is the rest.
 */
export function discountOf(text: string, base: number): number {
  if (!text.trim()) {
    return 0
  }
  const parsed = parseDiscount(text)
  if (!parsed.ok) {
    return 0
  }
  const amount =
    parsed.kind === 'percent'
      ? percentOf(base, parsed.percent)
      : parsed.kind === 'target'
        ? base - parsed.minor
        : parsed.minor
  return Math.min(Math.max(0, amount), base)
}

/**
 * Whether a discount field holds something that cannot be read, or, where
 * the sum it is taken from is given, an agreed sum above it: haggling only
 * brings a price down.
 */
export function badDiscount(text: string, base?: number): boolean {
  if (!text.trim()) {
    return false
  }
  const parsed = parseDiscount(text)
  return !parsed.ok || (parsed.kind === 'target' && base !== undefined && parsed.minor > base)
}

/** The sum agreed on that a discount field holds, if that is how it was written. */
export function agreedOf(text: string): number | null {
  const parsed = parseDiscount(text)
  return parsed.ok && parsed.kind === 'target' ? parsed.minor : null
}

/** How an agreed sum is written into a discount field. */
export const agreedText = (minor: number) => `=${formatMoney(minor, 'UZS', { symbol: false, group: ' ' })}`

/**
 * The round sums a total is usually brought down to, nearest first:
 * 1 770 000 gives 1 700 000 and 1 600 000; 285 000 gives 280 000 and
 * 270 000. The step is a tenth of the total's own order of size.
 */
export function roundTotals(total: number, count = 2): number[] {
  const som = Math.floor(total / 100)
  if (som < 1000) {
    return []
  }
  const step = 10 ** (String(som).length - 2)
  const first = Math.floor((som - 1) / step) * step
  return Array.from({ length: count }, (_, index) => (first - index * step) * 100).filter((sum) => sum > 0)
}

export interface CartTotals extends SaleTotals {
  /** Each line's own discount, as sent to the server. */
  lineDiscounts: number[]
  /** The discount on the whole sale, as sent to the server. */
  saleDiscount: number
}

/** What the cart comes to. The server works the same sum out again from its own prices. */
export function cartTotals(cart: Cart): CartTotals {
  const lineDiscounts = cart.lines.map((line) => discountOf(line.discountText, gross(line.item.price ?? 0, line.qty)))
  const afterLines = linesTotal(cart)
  const saleDiscount = discountOf(cart.discountText, afterLines)
  const totals = saleTotals(
    cart.lines.map((line, index) => ({ price: line.item.price ?? 0, qty: line.qty, discount: lineDiscounts[index] })),
    saleDiscount,
  )
  return { ...totals, lineDiscounts, saleDiscount }
}

/**
 * The lines that end up under what their thing may be sold for, each with that
 * floor for as many as are in the line. The server counts the same way.
 */
export function underFloor(cart: Cart, totals: SaleTotals): { index: number; floor: number }[] {
  const lines = cart.lines.map((line) => ({
    price: line.item.price ?? 0,
    minPrice: line.item.minPrice,
    qty: line.qty,
  }))
  return belowFloor(lines, totals).map((index) => ({
    index,
    floor: floorOf(lines[index].price, lines[index].minPrice, lines[index].qty) as number,
  }))
}

/** What the lines come to after their own discounts: what a discount on the whole sale is taken from. */
export function linesTotal(cart: Cart): number {
  return cart.lines.reduce((sum, line) => {
    const whole = gross(line.item.price ?? 0, line.qty)
    return sum + whole - discountOf(line.discountText, whole)
  }, 0)
}

/**
 * Puts a thing into the cart. A tagged piece is a line of its own and goes
 * in once; anything else adds to the line already there.
 */
export function addToCart(cart: Cart, item: PosItemDto, qty: number): { cart: Cart; added: boolean } {
  if (item.epc) {
    if (cart.lines.some((line) => line.item.epc === item.epc)) {
      return { cart, added: false }
    }
    return { cart: { ...cart, lines: [...cart.lines, { key: uuid(), item, qty: 1, discountText: '' }] }, added: true }
  }
  const existing = cart.lines.find((line) => line.item.variantId === item.variantId && !line.item.epc)
  const lines = existing
    ? cart.lines.map((line) =>
        line === existing ? { ...line, item, qty: Math.round((line.qty + qty) * 1000) / 1000 } : line,
      )
    : [...cart.lines, { key: uuid(), item, qty, discountText: '' }]
  return { cart: { ...cart, lines }, added: true }
}

/** "3*" before a scan or a search: that many of the next thing. Returns the count and what is left of the text. */
export function splitMultiplier(text: string): { qty: number | null; rest: string } {
  const match = /^\s*(\d{1,4})\s*\*\s*(.*)$/.exec(text)
  if (!match) {
    return { qty: null, rest: text.trim() }
  }
  const qty = Number(match[1])
  return { qty: qty > 0 ? qty : null, rest: match[2].trim() }
}

/** The change in words: "3 $ + 10 000 so'm". Dollars come first: they are counted out first. */
export function changeText(changeUzs: number, changeUsd: number): string {
  return [
    // Whole dollars only, so no cents are shown.
    changeUsd ? formatMoney(changeUsd, 'USD', { minor: 'never' }) : null,
    changeUzs || !changeUsd ? formatMoney(changeUzs, 'UZS', { minor: 'auto' }) : null,
  ]
    .filter(Boolean)
    .join(' + ')
}

/** The ways of paying a till takes, each with its own field: cash always, the rest when the shop has them. */
export function tenderRows(context: PosContextDto): TenderRow[] {
  const row = (key: string, method: TenderMethod, currency: CurrencyCode, accountId: string | null): TenderRow => ({
    key,
    method,
    currency,
    accountId,
    amount: null,
    value: null,
    reference: '',
  })
  return [
    row('cash', 'cash', 'UZS', null),
    ...(context.usd ? [row('usd', 'cash', 'USD', null)] : []),
    ...(context.cards.length ? [row('card', 'card', 'UZS', context.cards[0].id)] : []),
    ...(context.terminals.length ? [row('terminal', 'terminal', 'UZS', context.terminals[0].id)] : []),
  ]
}

// ───────────────────────────── Goods coming back ─────────────────────────────

/** A receipt goods are being brought back on, and how many of each of its lines. */
export interface Returning {
  found: ReturnableDto
  qty: Record<string, number>
  reason: string
}

export interface BackLine {
  line: SaleLineDto
  qty: number
  /** What it is worth coming back: what was paid for it. */
  total: number
}

export function backLines(returning: Returning | null): BackLine[] {
  if (!returning) {
    return []
  }
  return returning.found.sale.lines.flatMap((line) => {
    const qty = returning.qty[line.id]
    return qty ? [{ line, qty, total: returnShare(line, qty) }] : []
  })
}

/** The ways money can go back on a receipt: cash, and the cards and terminals it was paid with. */
export function refundRows(context: PosContextDto, found: ReturnableDto): TenderRow[] {
  return [
    ...tenderRows(context).filter((row) => row.method === 'cash'),
    ...found.caps.accounts.map((cap) => ({
      key: `account:${cap.accountId}`,
      method: cap.method,
      currency: 'UZS' as const,
      accountId: cap.accountId,
      amount: null,
      value: null,
      reference: '',
    })),
  ]
}

/**
 * How money owed to a customer goes back when the cashier types nothing: in
 * cash as far as cash may go, the rest to the cards it was paid with. Keyed
 * like the rows of `refundRows`.
 */
export function suggestRefunds(due: number, found: ReturnableDto, roundStep: number): Record<string, number> {
  const inCash = found.free ? due : Math.min(due, found.caps.cash)
  const suggested: Record<string, number> = {}
  let rest = due - inCash
  for (const cap of found.caps.accounts) {
    const take = Math.min(rest, cap.left)
    if (take) {
      suggested[`account:${cap.accountId}`] = take
      rest -= take
    }
  }
  // What the cards cannot take is left to cash, for the server to allow or refuse.
  const cash = roundToStep(inCash + rest, roundStep)
  if (cash) {
    suggested.cash = cash
  }
  return suggested
}
