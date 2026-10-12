import {
  baseWorth,
  combinations,
  costReceipt,
  receiptPrice,
  receiptRateWay,
  type AnyCurrency,
  type AttributeDto,
  type Costing,
  type ExpenseBasis,
  type LinePrice,
  type PriceFormula,
  type PriceLookupResult,
  type PriceTypeDto,
  type ProductDto,
  type ReceiptDto,
  type ReceiptExpenseInput,
  type ReceiptLineInput,
  type ReceiptPrice,
  type ReceiptPricing,
  type ReceiptProductDto,
  type RateBook,
} from '@erp/core'

import { base } from '@/lib/base'

/**
 * A receipt on the screen is a list of blocks, not of lines. A block is one
 * model at one price: its quantities are typed into a colour × size grid,
 * its price once. The same model at two prices is two blocks. Lines, one
 * per variant, are what the blocks become when the receipt is saved.
 */
export interface Block {
  /** Stable while the form is open; not sent anywhere. */
  key: string
  productId: string
  supplierId: string | null
  price: number | null
  extra: number | null
  retailPrice: number | null
  /** Prices for the other price types, by price type id. */
  otherPrices: Record<string, number | null>
  /** Prices typed as formulas ("30%", "ch −15%"), by price type id — the retail type's among them. */
  formulas: Record<string, PriceFormula>
  /** By variant id. */
  qty: Record<string, number | null>
}

/** The prices that hold a sum, as a line sends them. */
export function setPrices(prices: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(Object.entries(prices).filter((entry): entry is [string, number] => entry[1] !== null))
}

export interface ExpenseDraft {
  key: string
  name: string
  amount: number | null
  currency: AnyCurrency
  basis: ExpenseBasis
  isEstimate: boolean
}

export interface Header {
  locationId: string | null
  supplierId: string | null
  docDate: string
  currency: AnyCurrency
  /** Against the base, written `receiptRateWay` round; not read for a receipt in the base. */
  rate: number | null
  extraCurrency: AnyCurrency
  note: string
  /** How this receipt prices its own goods where the rules are not followed, by price type id. */
  pricing: Record<string, ReceiptPricing>
}

/** What the last receipt used, offered again on the next one. */
export interface ReceiptDefaults {
  locationId: string | null
  currency: AnyCurrency
}

/**
 * The day's rate of `currency`, written the way a receipt writes it ("1 ¥ = 1 750 so'm", or "1 $ = 7,25 ¥" in a
 * dollar business): to the tiyin where it runs to hundreds, to four places where it is a handful. Null for the
 * base, and while the day has no rate for it.
 */
export function dayRateOf(currency: AnyCurrency, book: RateBook): number | null {
  const one = currency === base() ? null : baseWorth(currency, book)
  if (!one) {
    return null
  }
  const value = receiptRateWay(currency, base()) === 'in' ? one.toNumber() : 1 / one.toNumber()
  const places = value >= 100 ? 100 : 10_000
  return Math.round(value * places) / places
}

export const NO_DEFAULTS: ReceiptDefaults = { locationId: null, currency: 'UZS' }

export const DEFAULTS_KEY = 'receipt.defaults'

let counter = 0
export const nextKey = () => `k${++counter}`

export function newBlock(productId: string, like?: Block): Block {
  return {
    key: nextKey(),
    productId,
    supplierId: null,
    price: like?.price ?? null,
    extra: like?.extra ?? null,
    retailPrice: like?.retailPrice ?? null,
    otherPrices: { ...like?.otherPrices },
    formulas: { ...like?.formulas },
    qty: {},
  }
}

/** The same whatever order it was written in. */
const sorted = (record: Record<string, unknown>) =>
  Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(';')

/** Lines that share a model, a supplier and every price are one block. */
export function blocksOf(receipt: ReceiptDto): Block[] {
  const blocks: Block[] = []
  const byIdentity = new Map<string, Block>()
  for (const line of receipt.lines) {
    const identity = [
      line.productId,
      line.supplierId,
      line.price,
      line.extra,
      line.retailPrice,
      sorted(line.otherPrices),
      sorted(line.priceFormulas),
    ].join('|')
    let block = byIdentity.get(identity)
    if (!block) {
      block = {
        key: nextKey(),
        productId: line.productId,
        supplierId: line.supplierId,
        price: line.price,
        extra: line.extra || null,
        retailPrice: line.retailPrice,
        otherPrices: { ...line.otherPrices },
        formulas: { ...line.priceFormulas },
        qty: {},
      }
      byIdentity.set(identity, block)
      blocks.push(block)
    }
    block.qty[line.variantId] = (block.qty[line.variantId] ?? 0) + line.qty
  }
  return blocks
}

export function expensesOf(receipt: ReceiptDto): ExpenseDraft[] {
  return receipt.expenses.map((expense) => ({
    key: nextKey(),
    name: expense.name,
    amount: expense.amount,
    currency: expense.currency,
    basis: expense.basis,
    isEstimate: expense.isEstimate,
  }))
}

/** The lines the blocks stand for, each remembering which block it came from. */
export function linesOf(
  blocks: Block[],
  products: Map<string, ReceiptProductDto>,
): { lines: ReceiptLineInput[]; blockOf: number[] } {
  const lines: ReceiptLineInput[] = []
  const blockOf: number[] = []
  blocks.forEach((block, index) => {
    for (const variant of products.get(block.productId)?.variants ?? []) {
      const qty = block.qty[variant.id]
      if (qty) {
        lines.push({
          variantId: variant.id,
          supplierId: block.supplierId,
          qty,
          price: block.price ?? 0,
          extra: block.extra ?? 0,
          retailPrice: block.retailPrice,
          otherPrices: setPrices(block.otherPrices),
          priceFormulas: block.formulas,
        })
        blockOf.push(index)
      }
    }
  })
  return { lines, blockOf }
}

export function expenseInputs(expenses: ExpenseDraft[]): ReceiptExpenseInput[] {
  return expenses
    .filter((expense) => expense.name.trim() || expense.amount)
    .map(({ name, amount, currency, basis, isEstimate }) => ({
      name: name.trim(),
      amount: amount ?? 0,
      currency,
      basis,
      isEstimate,
    }))
}

export interface BlockCost {
  qty: number
  goods: number
  costUzs: number
}

/** What the receipt costs as it stands on the screen, and each block's part of it. */
export function costOf(
  header: Header,
  blocks: Block[],
  expenses: ExpenseDraft[],
  products: Map<string, ReceiptProductDto>,
  /** The rates of the receipt's day: what an expense in a third currency is worth. */
  book: RateBook,
): { costing: Costing; blocks: BlockCost[] } | null {
  if (header.currency !== base() && !header.rate) {
    return null
  }
  const { lines, blockOf } = linesOf(blocks, products)
  const variantProduct = new Map<string, ReceiptProductDto>()
  products.forEach((product) => product.variants.forEach((variant) => variantProduct.set(variant.id, product)))

  const costing = costReceipt({
    base: base(),
    currency: header.currency,
    rate: header.rate,
    rateWay: receiptRateWay(header.currency, base()),
    book,
    extraCurrency: header.extraCurrency,
    lines: lines.map((line) => ({
      qty: line.qty,
      price: line.price,
      extra: line.extra,
      weightG: variantProduct.get(line.variantId)?.weightG ?? null,
    })),
    expenses: expenseInputs(expenses),
  })

  const perBlock: BlockCost[] = blocks.map(() => ({ qty: 0, goods: 0, costUzs: 0 }))
  costing.lines.forEach((line, index) => {
    const block = perBlock[blockOf[index]]
    block.qty = Math.round((block.qty + lines[index].qty) * 1000) / 1000
    block.goods += line.goods
    block.costUzs += line.costUzs
  })
  return { costing, blocks: perBlock }
}

/** What one unit of each model costs on the receipt as it stands — its blocks together, as posting will have it. */
export function modelCosts(blocks: Block[], costs: BlockCost[] | undefined): Map<string, number> {
  const sums = new Map<string, { qty: number; uzs: number }>()
  blocks.forEach((block, index) => {
    const cost = costs?.[index]
    if (cost?.qty) {
      const sum = sums.get(block.productId) ?? { qty: 0, uzs: 0 }
      sums.set(block.productId, { qty: sum.qty + cost.qty, uzs: sum.uzs + cost.costUzs })
    }
  })
  return new Map([...sums].map(([productId, sum]) => [productId, Math.round(sum.uzs / sum.qty)]))
}

/**
 * What one unit of a block comes to before its quantities are typed: its price and its own extra cost at the
 * receipt's rate, with no share of the expenses yet. A price can be offered as soon as the goods' own is typed.
 */
export function bareCost(header: Header, block: Block, book: RateBook): number | null {
  if (!block.price || (header.currency !== base() && !header.rate)) {
    return null
  }
  const costing = costReceipt({
    base: base(),
    currency: header.currency,
    rate: header.rate,
    rateWay: receiptRateWay(header.currency, base()),
    book,
    extraCurrency: header.extraCurrency,
    lines: [{ qty: 1, price: block.price, extra: block.extra ?? 0, weightG: null }],
    expenses: [],
  })
  return costing.lines[0]?.costUzs || null
}

/** What is typed into a block's field for a price type: a sum, a formula, or nothing. */
export function typedPrice(block: Block, typeId: string, retail: boolean): LinePrice | null {
  const amount = retail ? block.retailPrice : (block.otherPrices[typeId] ?? null)
  if (amount !== null) {
    return { amount }
  }
  const formula = block.formulas[typeId]
  return formula ? { formula } : null
}

/** The block with that field typed anew: a sum takes a formula's place, and a formula a sum's. */
export function withTypedPrice(block: Block, typeId: string, retail: boolean, value: LinePrice | null): Partial<Block> {
  const formulas = { ...block.formulas }
  delete formulas[typeId]
  if (value && 'formula' in value) {
    formulas[typeId] = value.formula
  }
  const amount = value && 'amount' in value ? value.amount : null
  return retail
    ? { retailPrice: amount, formulas }
    : { otherPrices: { ...block.otherPrices, [typeId]: amount }, formulas }
}

export interface FieldPrice {
  type: PriceTypeDto
  typed: LinePrice | null
  /** What the receipt makes of the field as it stands: the price posting sets, and where it comes from. */
  worked: ReceiptPrice
  /** The model's price of this type now; null with none, and until that is known. */
  standing: number | null
  /** What a formula here starts from. */
  basis: { cost: number | null; retail: number | null }
}

/**
 * What the receipt makes of each price field of a block: the retail type's first, the others' after it — theirs
 * may start from the retail price this receipt leaves. The rule is the server's own (`receiptPrice`): what is
 * shown is what posting sets. Until the rules and the prices that stand are known (`known`), and on a receipt
 * that is no longer a draft, only what is typed is worked out.
 */
export function blockPrices(
  block: Block,
  types: { retail: PriceTypeDto | undefined; others: PriceTypeDto[] },
  known: PriceLookupResult[string] | undefined,
  pricing: Record<string, ReceiptPricing>,
  cost: number | null,
): FieldPrice[] {
  const fields: FieldPrice[] = []
  let retailLeft: number | null = null
  for (const type of [types.retail, ...types.others]) {
    if (!type) {
      continue
    }
    const own = type === types.retail
    const standing = known?.prices[type.id] ?? null
    const typed = typedPrice(block, type.id, own)
    const basis = { cost, retail: own ? null : retailLeft }
    const worked = receiptPrice({
      typed,
      receipt: known ? pricing[type.id] : { skip: true, formula: null, all: false },
      rule: known?.formulas.find((item) => item.priceTypeId === type.id),
      standing,
      ...basis,
      rounding: { step: type.roundStep, ending: type.roundEnding },
      floor: type.kind === 'min',
    })
    if (own) {
      retailLeft = worked.price ?? standing
    }
    fields.push({ type, typed, worked, standing, basis })
  }
  return fields
}

/** What posting would do with each price type, counted in models: a model on two blocks is counted once. */
export function pricingCounts(
  blocks: Block[],
  priced: FieldPrice[][],
): Record<string, { fresh: number; replaced: number; kept: number }> {
  const counts: Record<string, { fresh: number; replaced: number; kept: number }> = {}
  const seen = new Set<string>()
  priced.forEach((fields, index) => {
    for (const { type, worked, standing } of fields) {
      const key = `${type.id}:${blocks[index].productId}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      const count = (counts[type.id] ??= { fresh: 0, replaced: 0, kept: 0 })
      if (worked.price !== null && standing === null) {
        count.fresh++
      } else if (worked.price !== null && worked.price !== standing) {
        count.replaced++
      } else if (standing !== null) {
        count.kept++
      }
    }
  })
  return counts
}

/** The price fields that set a price under what the goods cost: said before the receipt is posted, never refused. */
export function underCost(fields: FieldPrice[]): FieldPrice[] {
  return fields.filter(({ worked, basis }) => worked.price !== null && basis.cost !== null && worked.price < basis.cost)
}

/** What the form needs to know about a model, from the catalogue's own answer. */
export function toReceiptProduct(product: ProductDto): ReceiptProductDto {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    weightG: product.weightG,
    axisIds: product.axisIds,
    variants: product.variants.map(({ id, valueIds, sku, isActive }) => ({ id, valueIds, sku, isActive })),
  }
}

export interface MatrixValue {
  id: string
  name: string
  hex: string | null
}

export interface ProductMatrix {
  /** One row per combination of every axis but the last. */
  rows: { key: string; values: MatrixValue[] }[]
  columns: MatrixValue[]
  cellKey: (row: number, column: number) => string | null
  /** Names of the row axes, for the corner of the grid. */
  corner: string
}

/**
 * A model's variants as a grid: the last axis across, the others down. Only
 * values the model actually comes in are listed, in the catalogue's order.
 */
export function matrixOf(product: ReceiptProductDto, attributes: AttributeDto[]): ProductMatrix {
  if (!product.axisIds.length) {
    return {
      rows: [{ key: 'row', values: [] }],
      columns: [{ id: 'column', name: '', hex: null }],
      cellKey: () => product.variants[0]?.id ?? null,
      corner: '',
    }
  }

  const axes = product.axisIds.map((id) => attributes.find((attribute) => attribute.id === id))
  const used: MatrixValue[][] = product.axisIds.map((_id, position) => {
    const present = new Set(product.variants.map((variant) => variant.valueIds[position]))
    return (axes[position]?.values ?? [])
      .filter((value) => present.has(value.id))
      .map((value) => ({ id: value.id, name: value.name, hex: value.hex }))
  })
  const byKey = new Map(product.variants.map((variant) => [variant.valueIds.join('|'), variant.id]))

  const down = combinations(used.slice(0, -1))
  const across = used[used.length - 1]
  return {
    rows: down.map((values) => ({ key: values.map((value) => value.id).join('|') || 'row', values })),
    columns: across,
    cellKey: (row, column) => byKey.get([...down[row].map((value) => value.id), across[column].id].join('|')) ?? null,
    corner: axes
      .slice(0, -1)
      .map((attribute) => attribute?.name ?? '')
      .join(' · '),
  }
}
