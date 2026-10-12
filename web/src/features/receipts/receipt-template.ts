import {
  CURRENCIES,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  priceColumn,
  TEMPLATE_KEY,
  type AnyCurrency,
  type ImportColumnKey,
  type ImportFieldKey,
  type PriceTypeDto,
} from '@erp/core'
import type { TFunction } from 'i18next'
import type { Feature, Row, Sheet, SheetData } from 'write-excel-file/browser'

/** The rows above the goods: the hidden keys, then the headers people read. */
export const TEMPLATE_HEAD_ROWS = 2
const FIRST = TEMPLATE_HEAD_ROWS + 1
const LAST = TEMPLATE_HEAD_ROWS + MAX_IMPORT_ROWS

type Check = { kind: 'list'; values: string[] } | { kind: 'number'; min: number; above?: boolean } | { kind: 'year' }

export interface TemplateColumn {
  key: ImportColumnKey
  title: string
  width: number
  /** What the header is coloured as: a column every row needs, a selling price, or the rest. */
  group: 'needed' | 'price' | 'other'
  check?: Check
}

const WIDTHS: Partial<Record<ImportFieldKey, number>> = {
  name: 30,
  sku: 14,
  size: 10,
  color: 12,
  qty: 9,
  price: 12,
  extra: 14,
  barcode: 17,
  category: 18,
  supplier: 20,
  manufacturer: 18,
}

const NEEDED: ImportFieldKey[] = ['name', 'qty', 'price']

/**
 * The template's columns: the fixed ones in the order a person fills them, and after the purchase price one for
 * each price type the business keeps, each in the base. The headers are in the screen's language; the import does
 * not read them, it reads the hidden keys.
 */
export function templateColumns(
  t: TFunction,
  priceTypes: readonly PriceTypeDto[],
  base: AnyCurrency,
): TemplateColumn[] {
  const field = (key: ImportFieldKey): TemplateColumn => ({
    key,
    title: t(`import.fields.${key}`),
    width: WIDTHS[key] ?? 13,
    group: NEEDED.includes(key) ? 'needed' : 'other',
    check:
      key === 'qty'
        ? { kind: 'number', min: 0, above: true }
        : key === 'price' || key === 'extra'
          ? { kind: 'number', min: 0 }
          : key === 'season'
            ? { kind: 'list', values: t('import.seasonList').split(',') }
            : key === 'gender'
              ? { kind: 'list', values: t('import.genderList').split(',') }
              : key === 'collection'
                ? { kind: 'year' }
                : undefined,
  })
  const keys = IMPORT_FIELDS.map((item) => item.key)
  const at = keys.indexOf('extra') + 1
  return [
    ...keys.slice(0, at).map(field),
    ...priceTypes
      .filter((type) => type.isActive)
      .map((type): TemplateColumn => ({
        key: priceColumn(type.id),
        title: t('import.priceColumn', { name: type.name, currency: CURRENCIES[base].symbol }),
        width: 15,
        group: 'price',
        check: { kind: 'number', min: 0 },
      })),
    ...keys.slice(at).map(field),
  ]
}

const FILLS = { needed: '#FDE68A', price: '#BBF7D0', other: '#E5E7EB' }

const header = (column: TemplateColumn) => ({
  value: column.title,
  fontWeight: 'bold' as const,
  backgroundColor: FILLS[column.group],
  wrap: true,
  align: 'center' as const,
  alignVertical: 'center' as const,
  height: 36,
  borderStyle: 'thin' as const,
  borderColor: '#9CA3AF',
})

/** The hidden row: which field each column is. Styled, so that it stays locked with the headers. */
const keyCell = (column: TemplateColumn) => ({ value: `${TEMPLATE_KEY}${column.key}`, textColor: '#9CA3AF' })

export function columnLetter(index: number): string {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return letters
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Excel's own checks on what is typed under the headers: a number where a number goes, a choice from a list. */
export function validationsXml(columns: readonly TemplateColumn[], t: TFunction): string {
  const rules = columns.flatMap((column, index) => {
    if (!column.check) {
      return []
    }
    const range = `${columnLetter(index)}${FIRST}:${columnLetter(index)}${LAST}`
    const said = (error: string, style: 'stop' | 'warning' = 'stop') =>
      `allowBlank="1" showErrorMessage="1" errorStyle="${style}" errorTitle="${escape(column.title)}" error="${escape(error)}" sqref="${range}"`
    switch (column.check.kind) {
      case 'list':
        return [
          `<dataValidation type="list" ${said(t('import.checkList'), 'warning')}><formula1>"${escape(column.check.values.join(','))}"</formula1></dataValidation>`,
        ]
      case 'year':
        return [
          `<dataValidation type="whole" operator="between" ${said(t('import.checkYear'))}><formula1>2000</formula1><formula2>2100</formula2></dataValidation>`,
        ]
      case 'number':
        return [
          `<dataValidation type="decimal" operator="${column.check.above ? 'greaterThan' : 'greaterThanOrEqual'}" ${said(t(column.check.above ? 'import.checkPositive' : 'import.checkAmount'))}><formula1>${column.check.min}</formula1></dataValidation>`,
        ]
    }
  })
  return rules.length ? `<dataValidations count="${rules.length}">${rules.join('')}</dataValidations>` : ''
}

/**
 * Locks the sheet: the header rows cannot be changed, nor columns added or taken away; rows of goods are written,
 * added, removed and sorted as usual. No password — it keeps a header from being changed by mistake, and the
 * hidden keys still say which column is which if someone takes the lock off on purpose.
 */
export function lockSheet(xml: string, validations: string): string {
  const protection =
    '<sheetProtection sheet="1" objects="1" scenarios="1" formatCells="0" formatColumns="0" formatRows="0" ' +
    'insertRows="0" deleteRows="0" sort="0" autoFilter="0"/>'
  let out = xml.replace('</sheetData>', `</sheetData>${protection}`)
  if (validations) {
    // Excel keeps its elements in one order: the checks come before the page's margins and set-up.
    const before = ['<pageMargins', '<pageSetup', '<drawing', '</worksheet>']
      .map((tag) => out.indexOf(tag))
      .filter((at) => at !== -1)
    const at = Math.min(...before)
    out = out.slice(0, at) + validations + out.slice(at)
  }
  return out
}

/** Every cell nobody styled — the empty ones under the headers — is left open to write in. */
export function unlockPlainCells(styles: string): string {
  return styles.replace(/<cellXfs([^>]*)>\s*<xf([^>]*?)(\/>|>([\s\S]*?)<\/xf>)/, (_, list, attributes, _end, inner) => {
    const plain = attributes.replace(/\s*applyProtection="[^"]*"/, '').trimEnd()
    return `<cellXfs${list}><xf${plain} applyProtection="1">${inner ?? ''}<protection locked="0"/></xf>`
  })
}

function templateFeature<Content>(validations: string): Feature<Content> {
  return {
    files: {
      transform: {
        'xl/styles.xml': { transform: (content) => unlockPlainCells(content) },
        'xl/worksheets/sheet{id}.xml': {
          transform: (content, _options, { sheetIndex }) =>
            sheetIndex === 0 ? lockSheet(content, validations) : content,
          transformElementAttributes: (tagName, attributes, index, _options, { sheetIndex }) =>
            sheetIndex === 0 && tagName === 'row' && index === 0 ? { ...attributes, hidden: 1 } : attributes,
        },
      },
    },
  }
}

/** A few rows filled in as they should be, on a sheet of their own. */
function sampleRows(columns: readonly TemplateColumn[], t: TFunction, retailId: string | undefined): Row[] {
  const samples = [
    { name: 'Futbolka Polo', sku: 'PL-22', size: 'M', color: t('import.sampleColor'), qty: 10, price: 35.5 },
    { name: 'Futbolka Polo', sku: 'PL-22', size: 'L', color: t('import.sampleColor'), qty: 8, price: 35.5 },
    { name: t('import.sampleBelt'), sku: 'KM-7', qty: 30, price: 14.2, category: t('import.sampleBeltCategory') },
  ]
  const shared = {
    brand: 'Zara',
    category: t('import.sampleCategory'),
    supplier: 'Guangzhou Textile',
    season: t('import.seasonList').split(',')[0],
    gender: t('import.genderList').split(',')[0],
    collection: 2026,
  }
  return samples.map((sample) => {
    const values = { ...shared, ...sample } as Record<string, string | number>
    if (retailId && sample.sku === 'PL-22') {
      values[priceColumn(retailId)] = 120_000
    }
    return columns.map((column) => {
      const value = values[column.key]
      return value === undefined ? null : { value }
    })
  })
}

/**
 * The business's own receipt template: the goods sheet with its hidden keys and locked headers, a sheet saying
 * how to fill it, and a sheet filled in as an example.
 */
export function templateWorkbook<Content = File | Blob | ArrayBuffer>(
  t: TFunction,
  priceTypes: readonly PriceTypeDto[],
  base: AnyCurrency,
): { sheets: Sheet<Content>[]; features: Feature<Content>[] } {
  const columns = templateColumns(t, priceTypes, base)
  const widths = columns.map((column) => ({ width: column.width }))
  const guide: SheetData = [
    [{ value: t('import.guideTitle'), fontWeight: 'bold', fontSize: 14 }],
    ...(t('import.guide', { returnObjects: true, currency: CURRENCIES[base].symbol }) as string[]).map((line) => [
      { value: line, wrap: true },
    ]),
  ]
  const retailId = priceTypes.find((type) => type.kind === 'retail')?.id
  const sheets: Sheet<Content>[] = [
    {
      sheet: t('import.sheetGoods'),
      data: [columns.map(keyCell), columns.map(header)],
      columns: widths,
      stickyRowsCount: TEMPLATE_HEAD_ROWS,
      stickyColumnsCount: 1,
    },
    { sheet: t('import.sheetGuide'), data: guide, columns: [{ width: 110 }] },
    {
      sheet: t('import.sheetSample'),
      data: [columns.map(header), ...sampleRows(columns, t, retailId)],
      columns: widths,
      stickyRowsCount: 1,
    },
  ]
  return { sheets, features: [templateFeature<Content>(validationsXml(columns, t))] }
}

export async function downloadTemplate(t: TFunction, priceTypes: readonly PriceTypeDto[], base: AnyCurrency) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const { sheets, features } = templateWorkbook(t, priceTypes, base)
  await writeXlsxFile(sheets, { features }).toFile(t('import.templateFile'))
}
