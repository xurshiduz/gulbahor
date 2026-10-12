import { describe, expect, it } from 'vitest'

import { currencyOfHeader, guessMapping, readImportRow, templateMapping, type ImportPriceType } from './import'

// The business's price types: retail, a wholesale one it named "Optom", a family price and the floor.
const TYPES: ImportPriceType[] = [
  { id: 'retail', name: 'Chakana', kind: 'retail' },
  { id: 'family', name: 'Oila', kind: 'other' },
  { id: 'bulk', name: 'Optom', kind: 'other' },
  { id: 'floor', name: 'Minimal', kind: 'min' },
]
const NAMES = { retail: 'Chakana', family: 'Oila', bulk: 'Optom', floor: 'Minimal' }

// The header rows of the three templates the business fills in for its shipments.
const BISHKEK = [
  'НАИМЕНОВАНИЕ',
  'АРТИКУЛ',
  'V_Размер',
  'V_Цвет',
  'КОЛ-ВО',
  'цена закупки KIRGIZ SOM',
  'Бренд',
  'ПОСТАВЩИК',
  'ЦЕНА ПОСТАВКИ (USD)',
  'цена закупки',
  'РОЗНИЧНАЯ ЦЕНА (UZS)',
  'БАРКОД',
  'код фабрике',
  'Производитель',
  'Сезон',
  'Коллекция',
  'доп расход',
  'Пол',
  'КАТЕГОРИЯ',
]
const CHINA = [
  ...BISHKEK.slice(0, 5),
  'цена закупки YUAN',
  ...BISHKEK.slice(6, 11),
  'Variation_id',
  ...BISHKEK.slice(12),
  'БАРКОД',
]
const TURKEY = [
  ...BISHKEK.slice(0, 5),
  'ЦЕНА ЗАКУПКИ (USD)',
  ...BISHKEK.slice(6, 9),
  'Оптовая цена',
  'РОЗНИЧНАЯ ЦЕНА (UZS)',
  'Variation_id',
  ...BISHKEK.slice(12),
  'БАРКОД',
]

describe('guessMapping', () => {
  it('reads the Bishkek template', () => {
    expect(guessMapping(BISHKEK, TYPES)).toEqual({
      name: 0,
      sku: 1,
      size: 2,
      color: 3,
      qty: 4,
      price: 5,
      brand: 6,
      supplier: 7,
      'price:retail': 10,
      barcode: 11,
      factoryCode: 12,
      manufacturer: 13,
      season: 14,
      collection: 15,
      extra: 16,
      gender: 17,
      category: 18,
    })
  })

  it('finds the barcode at the end of the China template and leaves "Variation_id" alone', () => {
    const mapping = guessMapping(CHINA)
    expect(mapping.price).toBe(5)
    expect(mapping.barcode).toBe(19)
    expect(Object.values(mapping)).not.toContain(11)
  })

  it('takes the wholesale price from the Turkey template, for whichever type the business sells wholesale at', () => {
    const mapping = guessMapping(TURKEY, TYPES)
    expect(mapping).toMatchObject({ price: 5, 'price:bulk': 9, 'price:retail': 10, barcode: 19 })
    // Without the business's price types, the prices are not read at all.
    expect(Object.keys(guessMapping(TURKEY)).some((key) => key.startsWith('price:'))).toBe(false)
  })

  it('finds a price column by the price type’s name', () => {
    expect(guessMapping(['Nomi', 'Soni', 'Oila narxi (so‘m)', 'Цена Optom', 'Minimal'], TYPES)).toEqual({
      name: 0,
      qty: 1,
      'price:family': 2,
      'price:bulk': 3,
      'price:floor': 4,
    })
  })

  it('reads Uzbek and English headers in any order', () => {
    expect(guessMapping(['Rang', 'Soni', 'Nomi', 'O‘lcham', 'Xarid narxi', 'Barcode'])).toEqual({
      color: 0,
      qty: 1,
      name: 2,
      size: 3,
      price: 4,
      barcode: 5,
    })
  })
})

describe('currencyOfHeader', () => {
  it('tells the currency a price column is in', () => {
    expect(currencyOfHeader(CHINA[5])).toBe('CNY')
    expect(currencyOfHeader(BISHKEK[5])).toBe('KGS')
    expect(currencyOfHeader(TURKEY[5])).toBe('USD')
    expect(currencyOfHeader('РОЗНИЧНАЯ ЦЕНА (UZS)')).toBe('UZS')
    expect(currencyOfHeader('цена закупки')).toBeNull()
  })
})

describe('templateMapping', () => {
  it('takes the business’s own template by its hidden row of keys, whatever the headers under it say', () => {
    expect(
      templateMapping(['erp:name', 'erp:qty', 'erp:price', 'erp:price:retail', 'erp:nonsense', null, 'Soni']),
    ).toEqual({
      name: 0,
      qty: 1,
      price: 2,
      'price:retail': 3,
    })
    // A sheet of somebody else's, or a row of keys without the two columns every row needs, is no template.
    expect(templateMapping(BISHKEK)).toBeNull()
    expect(templateMapping(['erp:name', 'erp:price'])).toBeNull()
  })
})

describe('readImportRow', () => {
  const mapping = guessMapping(CHINA, TYPES)
  const row = (overrides: Record<number, unknown> = {}) => {
    const cells: unknown[] = [
      'Футболка Polo',
      'PL-22',
      'XL',
      'Чёрный',
      12,
      35.5,
      'Zara',
      'Guangzhou Textile',
      5,
      null,
      120000,
      null,
      'F-7781',
      'Китай',
      'Лето',
      'SS 2026',
      0.4,
      'Муж',
      'Футболки',
      4006381333931,
    ]
    Object.entries(overrides).forEach(([index, value]) => (cells[Number(index)] = value))
    return readImportRow(cells, mapping, 7, NAMES)
  }

  it('reads a row as the spreadsheet holds it: numbers as numbers, the rest as text', () => {
    expect(row()?.value).toEqual({
      row: 7,
      name: 'Футболка Polo',
      sku: 'PL-22',
      size: 'XL',
      color: 'Чёрный',
      qty: 12,
      price: 3550,
      extra: 40,
      prices: { retail: 120_000_00 },
      barcode: '4006381333931',
      brand: 'Zara',
      category: 'Футболки',
      supplier: 'Guangzhou Textile',
      factoryCode: 'F-7781',
      manufacturer: 'Китай',
      season: 'ss',
      collectionYear: 2026,
      gender: 'men',
    })
  })

  it('reads amounts typed as text and forgives what it cannot classify', () => {
    const read = row({ 4: '5*12', 5: '1 250,50', 14: 'Осень-зима', 15: 'базовая', 17: 'Детский' })
    expect(read?.value).toMatchObject({ qty: 60, price: 125_050, season: 'aw', collectionYear: null, gender: null })
    expect(row({ 17: 'Жен' })?.value?.gender).toBe('women')
    expect(row({ 14: 'fall' })?.value?.season).toBe('aw')
  })

  it('says what is wrong with a row, and skips an empty one', () => {
    expect(row({ 0: null })?.problems).toEqual(['Nomi yozilmagan'])
    expect(row({ 4: 0 })?.problems).toEqual(['Soni noto‘g‘ri yoki yozilmagan'])
    expect(row({ 5: 'abc', 10: -5 })?.problems).toEqual([
      'Xarid narxi noto‘g‘ri yozilgan',
      'Chakana narxi noto‘g‘ri yozilgan',
    ])
    // A price left empty is not a price.
    expect(row({ 10: null })?.value?.prices).toEqual({})
    expect(row({ 0: null, 4: null })).toBeNull()
  })
})
