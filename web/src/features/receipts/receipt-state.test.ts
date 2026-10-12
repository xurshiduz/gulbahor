import type { AttributeDto, PriceTypeDto, ReceiptDto, ReceiptProductDto, RuledMarkup } from '@erp/core'
import { describe, expect, it } from 'vitest'

import {
  bareCost,
  blockPrices,
  blocksOf,
  costOf,
  dayRateOf,
  linesOf,
  matrixOf,
  modelCosts,
  newBlock,
  pricingCounts,
  typedPrice,
  underCost,
  withTypedPrice,
  type Block,
  type Header,
} from './receipt-state'

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
  pricing: {},
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
      otherPrices: {},
      priceFormulas: {},
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
      otherPrices,
      priceFormulas: {},
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

  it('keeps a formula typed in place of a sum, and tells blocks apart by it', () => {
    const half = { base: 'cost' as const, percent: 50, amount: 0 }
    const block: Block = { ...newBlock('shirt'), price: 300, qty: { 'black-S': 2 } }
    // A formula takes a sum's place in the field, and a sum a formula's.
    const typed = { ...block, retailPrice: 90_000_00, ...withTypedPrice(block, 'retail', true, { formula: half }) }
    expect(typed.retailPrice).toBeNull()
    expect(typedPrice(typed, 'retail', true)).toEqual({ formula: half })
    const again = { ...typed, ...withTypedPrice(typed, 'retail', true, { amount: 95_000_00 }) }
    expect(typedPrice(again, 'retail', true)).toEqual({ amount: 95_000_00 })
    expect(again.formulas).toEqual({})
    // The same for another type's field, which leaves the retail one alone.
    const both = { ...typed, ...withTypedPrice(typed, 'family', false, { amount: 70_000_00 }) }
    expect(both.formulas).toEqual({ retail: half })
    expect(both.otherPrices).toEqual({ family: 70_000_00 })

    expect(linesOf([typed], products).lines[0].priceFormulas).toEqual({ retail: half })
    expect(newBlock('shirt', typed).formulas).toEqual({ retail: half })
    const saved = (variantId: string, priceFormulas: Record<string, unknown>) => ({
      id: variantId,
      variantId,
      productId: 'shirt',
      supplierId: null,
      qty: 1,
      price: 300,
      extra: 0,
      retailPrice: null,
      otherPrices: {},
      priceFormulas,
      costUzs: null,
    })
    const blocks = blocksOf({
      lines: [saved('black-S', { retail: half }), saved('black-M', { retail: half }), saved('white-L', {})],
    } as unknown as ReceiptDto)
    expect(blocks.map((item) => [Object.keys(item.qty), item.formulas])).toEqual([
      [['black-S', 'black-M'], { retail: half }],
      [['white-L'], {}],
    ])
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

describe('what a receipt makes of a block’s prices', () => {
  const type = (id: string, kind: PriceTypeDto['kind'], formula: PriceTypeDto['formula'] = null): PriceTypeDto => ({
    id,
    name: id,
    kind,
    currency: 'UZS',
    roundStep: 1000_00,
    roundEnding: 0,
    tillAccess: 'none',
    skipsFloor: false,
    formula,
    isActive: true,
  })
  const types = { retail: type('retail', 'retail'), others: [type('wholesale', 'other'), type('floor', 'min')] }
  const rule = (priceTypeId: string, base: 'cost' | 'retail', percent: number, of: string | null): RuledMarkup => ({
    priceTypeId,
    base,
    percent,
    amount: 0,
    rule: of,
  })
  const formulas = [
    rule('retail', 'cost', 50, 'Ko‘ylaklar'),
    rule('wholesale', 'retail', -10, null),
    rule('floor', 'cost', 5, null),
  ]
  const block: Block = { ...newBlock('shirt'), price: 300, qty: { 'black-S': 2 } }
  const cost = 80_500_00

  it('gives new goods the price their rule makes, each field after the one it starts from', () => {
    const fields = blockPrices(block, types, { formulas, prices: {} }, {}, cost)
    expect(fields.map((field) => [field.type.id, field.worked.price, field.worked.source, field.worked.rule])).toEqual([
      // 80 500 + 50%, up to the thousand.
      ['retail', 121_000_00, 'rule', 'Ko‘ylaklar'],
      // A tenth under the retail price this receipt leaves.
      ['wholesale', 109_000_00, 'own', null],
      // The floor is the till's to work out.
      ['floor', null, null, null],
    ])
    expect(fields[1].basis).toEqual({ cost, retail: 121_000_00 })
  })

  it('leaves a price that stands, says what the rule would give, and starts the others from what stands', () => {
    const fields = blockPrices(block, types, { formulas, prices: { retail: 150_000_00 } }, {}, cost)
    expect(fields[0].worked).toMatchObject({ price: null, offered: 121_000_00 })
    expect(fields[0].standing).toBe(150_000_00)
    expect(fields[1].worked.price).toBe(135_000_00)
  })

  it('follows what is typed, then what the receipt says of the type', () => {
    const typed = {
      ...block,
      ...withTypedPrice(block, 'retail', true, { formula: { base: 'cost', percent: 100, amount: 0 } }),
    }
    const known = { formulas, prices: { retail: 150_000_00, wholesale: 99_000_00 } }
    const pricing = { wholesale: { skip: false, formula: null, all: true } }
    const fields = blockPrices(typed, types, known, pricing, cost)
    expect(fields[0].worked).toMatchObject({ price: 161_000_00, source: 'typed' })
    // The receipt's "for the goods that have a price too": the wholesale price is worked out anew.
    expect(fields[1].worked).toMatchObject({ price: 145_000_00, source: 'own' })
    expect(pricingCounts([typed], [fields])).toEqual({
      retail: { fresh: 0, replaced: 1, kept: 0 },
      wholesale: { fresh: 0, replaced: 1, kept: 0 },
      floor: { fresh: 0, replaced: 0, kept: 0 },
    })
  })

  it('works out only what is typed until the rules are known, and on a receipt no longer a draft', () => {
    const typed = {
      ...block,
      ...withTypedPrice(block, 'wholesale', false, { formula: { base: 'cost', percent: 20, amount: 0 } }),
    }
    const fields = blockPrices(typed, types, undefined, { retail: { skip: false, formula: null, all: true } }, cost)
    expect(fields.map((field) => field.worked.price)).toEqual([null, 97_000_00, null])
  })

  it('counts a model on two blocks once, and says which prices are under what the goods cost', () => {
    const known = { formulas, prices: {} }
    const second = { ...newBlock('shirt', block), qty: { 'white-L': 1 } }
    const priced = [block, second].map((item) => blockPrices(item, types, known, {}, cost))
    expect(pricingCounts([block, second], priced).retail).toEqual({ fresh: 1, replaced: 0, kept: 0 })

    const cheap = { ...block, ...withTypedPrice(block, 'retail', true, { amount: 70_000_00 }) }
    expect(underCost(blockPrices(cheap, types, known, {}, cost)).map((field) => field.type.id)).toEqual([
      'retail',
      // A tenth under a retail price that is itself under cost.
      'wholesale',
    ])
  })

  it('costs a model by its blocks together, and a block with no quantities by its own price', () => {
    const blocks: Block[] = [
      { ...newBlock('shirt'), price: 300, qty: { 'black-S': 10 } },
      { ...newBlock('shirt'), price: 500, qty: { 'white-L': 10 } },
      { ...newBlock('belt'), price: 100, qty: {} },
    ]
    const priced = costOf(header, blocks, [], products, book)
    // 10 at 3 $ and 10 at 5 $: 4 $ each, at 12 800.
    expect(modelCosts(blocks, priced?.blocks)).toEqual(new Map([['shirt', 400 * 12_800]]))
    expect(bareCost(header, blocks[2], book)).toBe(100 * 12_800)
    expect(bareCost({ ...header, rate: null }, blocks[2], book)).toBeNull()
    expect(bareCost(header, { ...blocks[2], price: null }, book)).toBeNull()
  })
})
