import type { Blob } from 'node:buffer'
import type Stream from 'node:stream'

import { readImportRow, templateMapping, type PriceTypeDto } from '@erp/core'
import i18next from 'i18next'
import readXlsxFile from 'read-excel-file/node'
import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'

import { columnLetter, lockSheet, templateColumns, templateWorkbook, unlockPlainCells } from './receipt-template'

const t = i18next.t.bind(i18next)

const type = (id: string, name: string, kind: PriceTypeDto['kind'], isActive = true): PriceTypeDto => ({
  id,
  name,
  kind,
  currency: 'UZS',
  roundStep: 0,
  roundEnding: 0,
  tillAccess: 'none',
  skipsFloor: false,
  formula: null,
  isActive,
})
const TYPES = [
  type('retail', 'Chakana', 'retail'),
  type('bulk', 'Ulgurji', 'other'),
  type('old', 'Eski', 'other', false),
  type('floor', 'Minimal', 'min'),
]

describe('the receipt template', () => {
  it('has a column for each price type kept, after the purchase price, in the base', () => {
    const columns = templateColumns(t, TYPES, 'UZS')
    const titles = columns.map((column) => column.title)
    expect(titles.slice(0, 10)).toEqual([
      'Nomi',
      'Artikul',
      'O‘lcham',
      'Rang',
      'Soni',
      'Xarid narxi',
      'Qo‘shimcha xarajat (1 dona)',
      'Chakana narxi (so‘m)',
      'Ulgurji narxi (so‘m)',
      'Minimal narxi (so‘m)',
    ])
    expect(titles).not.toContain('Eski narxi (so‘m)')
    expect(columns.filter((column) => column.group === 'needed').map((column) => column.key)).toEqual([
      'name',
      'qty',
      'price',
    ])
  })

  it('is read back as it was written: the hidden keys, the headers, and an example the import understands', async () => {
    await i18next.changeLanguage('uz')
    const { sheets, features } = templateWorkbook<Stream | Buffer | Blob>(t, TYPES, 'UZS')
    const buffer = await writeXlsxFile(sheets, { features }).toBuffer()
    const [goods, guide, sample] = await readXlsxFile(buffer)
    expect([goods.sheet, guide.sheet, sample.sheet]).toEqual(['Kirim', 'Yo‘riqnoma', 'Namuna'])

    const mapping = templateMapping(goods.data[0])
    expect(mapping).toMatchObject({ name: 0, qty: 4, price: 5, 'price:retail': 7, 'price:bulk': 8 })
    expect(goods.data[1][0]).toBe('Nomi')
    expect(goods.data).toHaveLength(2)

    // The example sheet has the headers but not the keys: the import reads it by them, as anybody's sheet.
    const [first] = sample.data.slice(1)
    const row = readImportRow(first, mapping!, 3, { retail: 'Chakana', bulk: 'Ulgurji' })
    expect(row?.problems).toEqual([])
    expect(row?.value).toMatchObject({
      name: 'Futbolka Polo',
      size: 'M',
      qty: 10,
      price: 3550,
      prices: { retail: 120_000_00 },
      season: 'ss',
      gender: 'men',
      collectionYear: 2026,
    })
    expect(guide.data.length).toBeGreaterThan(5)
  })

  it('offers lists the import reads, in either language', async () => {
    for (const language of ['uz', 'ru']) {
      await i18next.changeLanguage(language)
      const columns = templateColumns(t, TYPES, 'UZS')
      const season = columns.findIndex((column) => column.key === 'season')
      const gender = columns.findIndex((column) => column.key === 'gender')
      const values = (index: number) => (columns[index].check as { values: string[] }).values
      const mapping = { name: 0, qty: 1, season: 2, gender: 3 }
      const read = (seasonText: string, genderText: string) =>
        readImportRow(['Kepka', 1, seasonText, genderText], mapping, 3)?.value
      expect(values(season).map((text) => read(text, '')?.season)).toEqual(['ss', 'aw', 'all'])
      expect(values(gender).map((text) => read('', text)?.gender)).toEqual(['men', 'women', 'boys', 'girls', 'unisex'])
    }
    await i18next.changeLanguage('uz')
  })
})

describe('locking the template', () => {
  const SHEET =
    '<worksheet><sheetViews/><cols/><sheetData><row r="1"/></sheetData><pageMargins left="0.7"/></worksheet>'

  it('locks the sheet and puts the checks where Excel looks for them', () => {
    const xml = lockSheet(SHEET, '<dataValidations count="1"/>')
    expect(xml).toBe(
      '<worksheet><sheetViews/><cols/><sheetData><row r="1"/></sheetData>' +
        '<sheetProtection sheet="1" objects="1" scenarios="1" formatCells="0" formatColumns="0" formatRows="0" ' +
        'insertRows="0" deleteRows="0" sort="0" autoFilter="0"/>' +
        '<dataValidations count="1"/><pageMargins left="0.7"/></worksheet>',
    )
  })

  it('leaves open the cells nobody styled, and nothing else', () => {
    expect(
      unlockPlainCells('<styleSheet><cellXfs count="2"><xf ></xf><xf fontId="1"></xf></cellXfs></styleSheet>'),
    ).toBe(
      '<styleSheet><cellXfs count="2"><xf applyProtection="1"><protection locked="0"/></xf><xf fontId="1"></xf></cellXfs></styleSheet>',
    )
    expect(unlockPlainCells('<cellXfs count="1"><xf numFmtId="0"/></cellXfs>')).toBe(
      '<cellXfs count="1"><xf numFmtId="0" applyProtection="1"><protection locked="0"/></xf></cellXfs>',
    )
  })

  it('names columns as Excel does', () => {
    expect([0, 25, 26, 27, 51, 52].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })
})
