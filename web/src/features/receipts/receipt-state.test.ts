import type { AttributeDto, ReceiptDto, ReceiptProductDto } from '@erp/core'
import { describe, expect, it } from 'vitest'

import { blocksOf, costOf, dayRateOf, linesOf, matrixOf, newBlock, type Block, type Header } from './receipt-state'

const value = (id: string, hex: string | null = null) => ({ id, name: id, hex, isActive: true })
const attributes: AttributeDto[] = [
  {
    id: 'color',
    name: 'Rang',
    kind: 'color',
    isActive: true,
    values: [value('white', '#FFFFFF'), value('black', '#000000')],
  },
  { id: 'size', name: 'O‘lcham', kind: 'size', isActive: true, values: ['S', 'M', 'L'].map((id) => value(id)) },
]

const shirt: ReceiptProductDto = {
  id: 'shirt',
  name: 'Futbolka',
  sku: '1001',
  unit: 'pcs',
  weightG: 200,
  axisIds: ['color', 'size'],
  variants: [
    { id: 'black-M', valueIds: ['black', 'M'], sku: '1001-02', isActive: true },
    { id: 'black-S', valueIds: ['black', 'S'], sku: '1001-01', isActive: true },
    { id: 'white-L', valueIds: ['white', 'L'], sku: '1001-03', isActive: true },
  ],
}
const belt: ReceiptProductDto = {
  id: 'belt',
  name: 'Kamar',
  sku: '1002',
  unit: 'pcs',
  weightG: null,
  axisIds: [],
  variants: [{ id: 'belt-1', valueIds: [], sku: '1002-01', isActive: true }],
}
const products = new Map([shirt, belt].map((product) => [product.id, product]))

const header: Header = {
  locationId: 'shop',
  supplierId: null,
  docDate: '2026-10-01',
  currency: 'USD',
  rate: 12_800,
  extraCurrency: 'USD',
  note: '',
}

const book = { base: 'UZS' as const, rates: {} }

describe('matrixOf', () => {
  it('lays the variants out by colour and size in the catalogue order, with gaps where none exists', () => {
    const matrix = matrixOf(shirt, attributes)
    expect(matrix.rows.map((row) => row.values[0].name)).toEqual(['white', 'black'])
    expect(matrix.columns.map((column) => column.name)).toEqual(['S', 'M', 'L'])
    expect(matrix.corner).toBe('Rang')
    expect([0, 1, 2].map((column) => matrix.cellKey(0, column))).toEqual([null, null, 'white-L'])
    expect([0, 1, 2].map((column) => matrix.cellKey(1, column))).toEqual(['black-S', 'black-M', null])
  })

  it('is a single cell for a model without axes', () => {
    const matrix = matrixOf(belt, attributes)
    expect(matrix.rows).toHaveLength(1)
    expect(matrix.columns).toHaveLength(1)
    expect(matrix.cellKey(0, 0)).toBe('belt-1')
  })
})

describe('blocks and lines', () => {
  it('turns blocks into one line per variant with a quantity, in the model’s own order', () => {
    const block = {
      ...newBlock('shirt'),
      price: 300,
      retailPrice: 90_000_00,
      qty: { 'black-S': 2, 'white-L': 5, 'black-M': null },
    }
    const { lines, blockOf } = linesOf([block, { ...newBlock('belt'), qty: { 'belt-1': 4 } }], products)
    expect(lines.map((line) => [line.variantId, line.qty, line.price, line.retailPrice])).toEqual([
      ['black-S', 2, 300, 90_000_00],
      ['white-L', 5, 300, 90_000_00],
      ['belt-1', 4, 0, null],
    ])
    expect(blockOf).toEqual([0, 0, 1])
  })

  it('groups a saved receipt’s lines back into blocks: same model, same prices, one block', () => {
    const line = (variantId: string, productId: string, qty: number, price: number) => ({
      id: variantId,
      variantId,
      productId,
      supplierId: null,
      qty,
      price,
      extra: 0,
      retailPrice: null,
      wholesalePrice: null,
      otherPrices: {},
      costUzs: null,
    })
    const blocks = blocksOf({
      lines: [
        line('black-S', 'shirt', 2, 300),
        line('belt-1', 'belt', 4, 150),
        line('black-M', 'shirt', 3, 300),
        line('white-L', 'shirt', 1, 350),
      ],
    } as unknown as ReceiptDto)
    expect(blocks.map((block) => [block.productId, block.price, block.qty])).toEqual([
      ['shirt', 300, { 'black-S': 2, 'black-M': 3 }],
      ['belt', 150, { 'belt-1': 4 }],
      ['shirt', 350, { 'white-L': 1 }],
    ])
  })

  it('carries a price for every other price type, and tells blocks apart by them', () => {
    const block: Block = {
      ...newBlock('shirt'),
      price: 300,
      // The floor is set; the family price was looked at and left empty.
      otherPrices: { min: 60_000_00, family: null },
      qty: { 'black-S': 2, 'black-M': 1 },
    }
    const { lines } = linesOf([block], products)
    expect(lines.map((line) => line.otherPrices)).toEqual([{ min: 60_000_00 }, { min: 60_000_00 }])
    // The next block of the same model starts from the same prices, and is its own.
    const next = newBlock('shirt', block)
    expect(next.otherPrices).toEqual({ min: 60_000_00, family: null })
    next.otherPrices.min = 1
    expect(block.otherPrices.min).toBe(60_000_00)

    const saved = (variantId: string, otherPrices: Record<string, number>) => ({
      id: variantId,
      variantId,
      productId: 'shirt',
      supplierId: null,
      qty: 1,
      price: 300,
      extra: 0,
      retailPrice: null,
      wholesalePrice: null,
      otherPrices,
      costUzs: null,
    })
    const blocks = blocksOf({
      lines: [
        saved('black-S', { min: 60_000_00, family: 50_000_00 }),
        // The same prices written the other way round are the same prices.
        saved('black-M', { family: 50_000_00, min: 60_000_00 }),
        saved('white-L', { min: 65_000_00 }),
      ],
    } as unknown as ReceiptDto)
    expect(blocks.map((item) => [Object.keys(item.qty), item.otherPrices])).toEqual([
      [['black-S', 'black-M'], { min: 60_000_00, family: 50_000_00 }],
      [['white-L'], { min: 65_000_00 }],
    ])
  })

  it('costs each block with its share of the expenses, and waits for a rate', () => {
    const blocks: Block[] = [
      { ...newBlock('shirt'), price: 300, qty: { 'black-S': 10 } },
      { ...newBlock('belt'), price: 100, qty: { 'belt-1': 10 } },
    ]
    const expenses = [
      { key: 'e', name: 'Boj', amount: 800, currency: 'USD' as const, basis: 'value' as const, isEstimate: false },
    ]
    const cost = costOf(header, blocks, expenses, products, book)
    expect(cost?.blocks.map((block) => [block.qty, block.goods, block.costUzs])).toEqual([
      [10, 3000, 3600 * 12_800],
      [10, 1000, 1200 * 12_800],
    ])
    expect(cost?.costing.totals.costUzs).toBe(4800 * 12_800)

    expect(costOf({ ...header, rate: null }, blocks, expenses, products, book)).toBeNull()
    // A receipt in the base has no rate to wait for.
    expect(costOf({ ...header, currency: 'UZS', rate: null }, blocks, [], products, book)?.costing.totals.costUzs).toBe(
      4000,
    )
  })

  it('offers the day’s rate the way the receipt writes it', () => {
    const day = {
      base: 'UZS' as const,
      rates: {
        USD: { against: 'UZS' as const, way: 'in' as const, value: 12_650 },
        CNY: { against: 'USD' as const, way: 'per' as const, value: 7.25 },
      },
    }
    expect(dayRateOf('USD', day)).toBe(12_650)
    // 12 650 ÷ 7,25, to the tiyin.
    expect(dayRateOf('CNY', day)).toBe(1_744.83)
    expect(dayRateOf('TRY', day)).toBeNull()
    expect(dayRateOf('UZS', day)).toBeNull()
  })
})
