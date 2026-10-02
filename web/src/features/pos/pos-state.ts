import {
  formatMoney,
  gross,
  parseDiscount,
  percentOf,
  saleTotals,
  type CurrencyCode,
  type PaymentMethod,
  type PosItemDto,
  type SaleTotals,
} from '@gulbahor/core'

/** One line of the cart: a thing, how many, and what is taken off as the cashier typed it ("10%", "5000"). */
export interface CartLine {
  key: string
  item: PosItemDto
  qty: number
  discountText: string
}

/** One way the customer is paying. */
export interface TenderRow {
  key: string
  method: PaymentMethod
  currency: CurrencyCode
  /** The card or terminal; null for cash. */
  accountId: string | null
  amount: number | null
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
 * A random id that works on any page. `crypto.randomUUID` exists only on
 * https and localhost, and a till is often opened by the shop's address on
 * the local network.
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** What "10%" or "5000" takes off `base`, in tiyin; nothing for what cannot be read. */
export function discountOf(text: string, base: number): number {
  if (!text.trim()) {
    return 0
  }
  const parsed = parseDiscount(text)
  if (!parsed.ok) {
    return 0
  }
  const amount = parsed.kind === 'percent' ? percentOf(base, parsed.percent) : parsed.minor
  return Math.min(Math.max(0, amount), base)
}

/** Whether a discount field holds something that cannot be read. */
export const badDiscount = (text: string) => !!text.trim() && !parseDiscount(text).ok

export interface CartTotals extends SaleTotals {
  /** Each line's own discount, as sent to the server. */
  lineDiscounts: number[]
  /** The discount on the whole sale, as sent to the server. */
  saleDiscount: number
}

/** What the cart comes to. The server works the same sum out again from its own prices. */
export function cartTotals(cart: Cart): CartTotals {
  const lineDiscounts = cart.lines.map((line) => discountOf(line.discountText, gross(line.item.price ?? 0, line.qty)))
  const afterLines = cart.lines.reduce(
    (sum, line, index) => sum + gross(line.item.price ?? 0, line.qty) - lineDiscounts[index],
    0,
  )
  const saleDiscount = discountOf(cart.discountText, afterLines)
  const totals = saleTotals(
    cart.lines.map((line, index) => ({ price: line.item.price ?? 0, qty: line.qty, discount: lineDiscounts[index] })),
    saleDiscount,
  )
  return { ...totals, lineDiscounts, saleDiscount }
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
