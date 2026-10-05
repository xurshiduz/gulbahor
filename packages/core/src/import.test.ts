import { describe, expect, it } from 'vitest'

import { currencyOfHeader, guessMapping, readImportRow } from './import'

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
    expect(guessMapping(BISHKEK)).toEqual({
      name: 0,
      sku: 1,
      size: 2,
      color: 3,
      qty: 4,
      price: 5,
      brand: 6,
      supplier: 7,
      retailPrice: 10,
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

  it('takes the wholesale price from the Turkey template', () => {
    const mapping = guessMapping(TURKEY)
    expect(mapping).toMatchObject({ price: 5, wholesalePrice: 9, retailPrice: 10, barcode: 19 })
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

describe('readImportRow', () => {
  const mapping = guessMapping(CHINA)
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
    return readImportRow(cells, mapping, 7)
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
      retailPrice: 120_000_00,
      wholesalePrice: null,
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
      'Chakana narx noto‘g‘ri yozilgan',
    ])
    expect(row({ 0: null, 4: null })).toBeNull()
  })
})
