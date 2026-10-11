import {
  belowFloor,
  exchange,
  floorOf,
  formatMoney,
  cartAutos,
  gross,
  parseDiscount,
  percentOf,
  returnShare,
  roundToStep,
  saleTotals,
  tillWorth,
  type ChangeLine,
  type ChangeWay,
  type CurrencyCode,
  type LineAuto,
  type PosContextDto,
  type PosCustomerDto,
  type PosItemDto,
  type RateBook,
  type ReturnableDto,
  type SaleLineDto,
  type SaleTotals,
  type Settlement,
  type Tender,
  type TenderMethod,
  type AnyCurrency,
} from '@erp/core'
import type { TFunction } from 'i18next'

import { base } from '@/lib/base'
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
  /** The price type the cart is sold at, when it is not the retail one; absent in a cart kept from before. */
  priceTypeId?: string | null
  /** Who is buying, when they are on the books, with the rules their groups give. */
  customer?: PosCustomerDto | null
  /** The promotion code the customer said, once the till has been told it means something. */
  promoCode?: string | null
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
export const agreedText = (minor: number) => `=${formatMoney(minor, base(), { symbol: false, group: ' ' })}`

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
  /** What comes off each line by itself, and whose it is: a promotion's, the customer's own, or both. */
  autos: LineAuto[]
}

/**
 * What comes off each line by itself: the best promotion in force for it (one that looks at the line, or at
 * the whole cart), the customer's own discount, or both.
 */
const autosOf = (cart: Cart, ownPercent: number): LineAuto[] =>
  cartAutos(
    cart.lines.map((line) => ({ price: line.item.price ?? 0, qty: line.qty, offers: line.item.promos ?? [] })),
    ownPercent,
  )

/** Why money came off by itself, in a line: the promotions by name, then the customer's own reason. */
export function autoReasons(autos: readonly LineAuto[], own: string | null): string {
  const promotions = [...new Set(autos.flatMap((line) => (line.promoOff && line.promo ? [line.promo.name] : [])))]
  return [...promotions, ...(own && autos.some((line) => line.ownOff) ? [own] : [])].join(', ')
}

/**
 * What the cart comes to. The server works the same sum out again from its own prices. `ownPercent` is the
 * customer's own discount: it comes off each line first, by itself, and what the cashier gives is counted
 * from what is left.
 */
export function cartTotals(cart: Cart, ownPercent = 0): CartTotals {
  const autos = autosOf(cart, ownPercent)
  const lineDiscounts = cart.lines.map((line, index) =>
    discountOf(line.discountText, gross(line.item.price ?? 0, line.qty) - autos[index].auto),
  )
  const afterLines = linesTotal(cart, ownPercent)
  const saleDiscount = discountOf(cart.discountText, afterLines)
  const totals = saleTotals(
    cart.lines.map((line, index) => ({
      price: line.item.price ?? 0,
      qty: line.qty,
      discount: lineDiscounts[index],
      auto: autos[index].auto,
    })),
    saleDiscount,
  )
  return { ...totals, lineDiscounts, saleDiscount, autos }
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

/**
 * What the lines come to after what comes off by itself and their own discounts: what a discount on the
 * whole sale is taken from.
 */
export function linesTotal(cart: Cart, ownPercent = 0): number {
  const autos = autosOf(cart, ownPercent)
  return cart.lines.reduce((sum, line, index) => {
    const left = gross(line.item.price ?? 0, line.qty) - autos[index].auto
    return sum + left - discountOf(line.discountText, left)
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

/**
 * A part of the change as the cashier is writing it: what goes back otherwise than as cash in the base — another
 * drawer's notes, a sum kept on the customer's account, a sum sent from one of the shop's cards.
 */
export interface ChangeRow {
  key: string
  way: ChangeWay
  currency: AnyCurrency
  /** The card it is sent from; null for a drawer and for the customer's account. */
  accountId: string | null
  /** In the row's own currency: typed for a drawer or a card; for the customer's account, only where it was agreed. */
  amount: number | null
  /** In the base: typed for the customer's account; for a drawer or a card, only where it was agreed. */
  value: number | null
}

/**
 * The ways change can go back beside cash in the base: each other drawer that has a rate, the customer's
 * account when there is one to keep it on (`account` is its currency), each of the shop's cards.
 */
export function changeRows(context: PosContextDto, account: AnyCurrency | null): ChangeRow[] {
  const row = (key: string, way: ChangeWay, currency: AnyCurrency, accountId: string | null): ChangeRow => ({
    key,
    way,
    currency,
    accountId,
    amount: null,
    value: null,
  })
  return [
    ...context.currencies
      .filter((code) => code !== base() && tillWorth(100, code, context.book) !== null)
      .map((code) => row(`cash:${code}`, 'cash', code, null)),
    ...(account ? [row('account', 'account', account, null)] : []),
    ...context.cards.map((card) => row(`card:${card.id}`, 'card', card.currency, card.id)),
  ]
}

/** A part of the change as it is counted and sent: which row it is, and the card where there is one. */
export type WrittenChange = ChangeLine & { key: string; accountId: string | null }

/**
 * The parts written, as the sale sends them. `over` is what was paid over the sum. Notes of another currency
 * worth more than what is left to give go for what is left — "two dollars for the 25 000" — and the rate keeps
 * the difference, as it does where the worth was typed.
 */
export function changeLines(rows: readonly ChangeRow[], over: number, book: RateBook): WrittenChange[] {
  const foreign = (row: ChangeRow) => row.currency !== book.base
  // What each row stands for with nothing fitted to what is left.
  const plain = rows.map((row) => {
    if (row.way === 'account') {
      return row.value ?? 0
    }
    if (!row.amount) {
      return 0
    }
    return foreign(row) ? (row.value ?? tillWorth(row.amount, row.currency, book) ?? 0) : row.amount
  })
  const all = plain.reduce((sum, value) => sum + value, 0)
  return rows.flatMap((row, index): WrittenChange[] => {
    const part = { key: row.key, way: row.way, currency: row.currency, accountId: row.accountId }
    if (row.way === 'account') {
      // What is kept there is typed in the base; an account in another currency takes it at the rate, or as agreed.
      if (!row.value) {
        return []
      }
      if (!foreign(row)) {
        return [{ ...part, amount: row.value, value: null }]
      }
      const amount = row.amount ?? exchange(row.value, book.base, row.currency, book)
      return amount ? [{ ...part, amount, value: row.value }] : []
    }
    if (!row.amount) {
      return []
    }
    if (!foreign(row)) {
      return [{ ...part, amount: row.amount, value: null }]
    }
    const rest = over - (all - plain[index])
    return [{ ...part, amount: row.amount, value: row.value ?? (rest > 0 && plain[index] > rest ? rest : null) }]
  })
}

/** A part of the change as a sale wrote it, or as a settlement is about to. */
export interface ChangePart {
  way: ChangeWay
  currency: AnyCurrency
  amount: number
}

/** The parts a settlement's change goes back in: what was named, then the cash in the base. */
export const changeOf = (settlement: Settlement): ChangePart[] => [
  ...settlement.given,
  ...(settlement.changeUzs ? [{ way: 'cash' as const, currency: base(), amount: settlement.changeUzs }] : []),
]

/**
 * The cash of the change in words: "3 $ + 10 000 so'm". Another currency comes first: it is counted out
 * first. Empty when none of it is cash.
 */
export function changeText(parts: readonly ChangePart[]): string {
  const cash = parts.filter((part) => part.way === 'cash')
  // Whole notes of another currency are said without their cents: "6 $", but "6,50 $".
  const said = (part: ChangePart) =>
    formatMoney(part.amount, part.currency, {
      minor: part.currency === base() ? 'auto' : part.amount % 100 ? 'always' : 'never',
    })
  return [...cash.filter((part) => part.currency !== base()), ...cash.filter((part) => part.currency === base())]
    .map(said)
    .join(' + ')
}

/** All of the change in a line: "2 $ + 10 000 so'm, hisobiga 15 000 so'm, kartadan 5 000 so'm". */
export function changeWords(parts: readonly ChangePart[], t: TFunction): string {
  const elsewhere = parts.filter((part) => part.way !== 'cash')
  return [
    changeText(parts),
    ...elsewhere.map((part) =>
      t(part.way === 'account' ? 'pos.changeKeptWords' : 'pos.changeSentWords', {
        amount: formatMoney(part.amount, part.currency, { minor: 'auto' }),
      }),
    ),
  ]
    .filter(Boolean)
    .join(', ')
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
  // Cash in every currency the till takes, then every card and every terminal of the shop: none is picked from a list.
  return [
    row('cash', 'cash', base(), null),
    ...context.currencies.filter((code) => code !== base()).map((code) => row(`cash:${code}`, 'cash', code, null)),
    ...context.cards.map((card) => row(`account:${card.id}`, 'card', card.currency, card.id)),
    ...context.terminals.map((terminal) => row(`account:${terminal.id}`, 'terminal', base(), terminal.id)),
  ]
}

/** The rows something was typed into. */
export const enteredRows = (rows: readonly TenderRow[]): TenderRow[] => rows.filter((row) => row.amount)

/**
 * Those rows as the sums know them. Only what is taken in is ever agreed
 * on; what goes back goes back at the rate.
 */
export function tendersOf(entered: readonly TenderRow[], refunding: boolean): Tender[] {
  return entered.map((row) => ({
    method: row.method,
    currency: row.currency,
    amount: row.amount as number,
    value: refunding ? null : row.value,
  }))
}

/**
 * The rows typed for handing money back, as it is counted and sent. Notes of another currency worth more than
 * what is left to hand back go for what is left, as change does; a worth typed is the worth.
 */
export function refundsOf(entered: readonly TenderRow[], due: number, book: RateBook): Tender[] {
  const paired = (row: TenderRow) => row.method === 'cash' && row.currency !== book.base
  const plain = entered.map((row) => {
    const atRate = tillWorth(row.amount as number, row.currency, book) ?? 0
    return paired(row) ? (row.value ?? atRate) : atRate
  })
  const all = plain.reduce((sum, value) => sum + value, 0)
  return entered.map((row, index) => {
    const rest = due - (all - plain[index])
    return {
      method: row.method,
      currency: row.currency,
      amount: row.amount as number,
      value: paired(row) ? (row.value ?? (rest > 0 && plain[index] > rest ? rest : null)) : null,
    }
  })
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
      currency: base(),
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
