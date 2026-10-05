import {
  combinations,
  costReceipt,
  type AnyCurrency,
  type AttributeDto,
  type Costing,
  type ExpenseBasis,
  type ProductDto,
  type ReceiptDto,
  type ReceiptExpenseInput,
  type ReceiptLineInput,
  type ReceiptProductDto,
} from '@gulbahor/core'

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
  wholesalePrice: number | null
  /** Prices for the other price types, by price type id. */
  otherPrices: Record<string, number | null>
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
  usdRate: number | null
  uzsRate: number | null
  extraCurrency: AnyCurrency
  note: string
}

/** What the last receipt used, offered again on the next one. */
export interface ReceiptDefaults {
  locationId: string | null
  currency: AnyCurrency
  uzsRate: number | null
  /** Units per dollar, by currency. */
  usdRates: Partial<Record<AnyCurrency, number>>
}

export const NO_DEFAULTS: ReceiptDefaults = { locationId: null, currency: 'USD', uzsRate: null, usdRates: {} }

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
    wholesalePrice: like?.wholesalePrice ?? null,
    otherPrices: { ...like?.otherPrices },
    qty: {},
  }
}

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
      line.wholesalePrice,
      // The same prices are the same whatever order they were written in.
      Object.entries(line.otherPrices)
        .sort(([a], [b]) => a.localeCompare(b))
        .join(';'),
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
        wholesalePrice: line.wholesalePrice,
        otherPrices: { ...line.otherPrices },
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
          wholesalePrice: block.wholesalePrice,
          otherPrices: setPrices(block.otherPrices),
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
  costUsd: number
  costUzs: number
}

/** What the receipt costs as it stands on the screen, and each block's part of it. */
export function costOf(
  header: Header,
  blocks: Block[],
  expenses: ExpenseDraft[],
  products: Map<string, ReceiptProductDto>,
): { costing: Costing; blocks: BlockCost[] } | null {
  if (!header.uzsRate || (header.currency !== 'USD' && header.currency !== 'UZS' && !header.usdRate)) {
    return null
  }
  const { lines, blockOf } = linesOf(blocks, products)
  const variantProduct = new Map<string, ReceiptProductDto>()
  products.forEach((product) => product.variants.forEach((variant) => variantProduct.set(variant.id, product)))

  const costing = costReceipt({
    currency: header.currency,
    usdRate: header.usdRate ?? 1,
    uzsRate: header.uzsRate,
    extraCurrency: header.extraCurrency,
    lines: lines.map((line) => ({
      qty: line.qty,
      price: line.price,
      extra: line.extra,
      weightG: variantProduct.get(line.variantId)?.weightG ?? null,
    })),
    expenses: expenseInputs(expenses),
  })

  const perBlock: BlockCost[] = blocks.map(() => ({ qty: 0, goods: 0, costUsd: 0, costUzs: 0 }))
  costing.lines.forEach((line, index) => {
    const block = perBlock[blockOf[index]]
    block.qty = Math.round((block.qty + lines[index].qty) * 1000) / 1000
    block.goods += line.goods
    block.costUsd += line.costUsd
    block.costUzs += line.costUzs
  })
  return { costing, blocks: perBlock }
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
