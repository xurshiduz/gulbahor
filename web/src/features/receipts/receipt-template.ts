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

/** The hidden row: which field each column is. */
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

/**
 * Excel's own checks on what is typed. Under the headers: a number where a number goes, a choice from a list.
 * In the head rows themselves: nothing — whatever is typed there is turned away, which is all the guarding the
 * headers get. The sheet is not locked: a lock made every cell pasted in from another file locked too, and some
 * programs took the empty cells for locked ones, so that the template could not be filled in at all.
 */
export function validationsXml(columns: readonly TemplateColumn[], t: TFunction): string {
  const head =
    `<dataValidation type="custom" allowBlank="0" showErrorMessage="1" errorStyle="stop" ` +
    `errorTitle="${escape(t('import.checkHeadTitle'))}" error="${escape(t('import.checkHead'))}" ` +
    `sqref="A1:${columnLetter(columns.length - 1)}${TEMPLATE_HEAD_ROWS}"><formula1>FALSE</formula1></dataValidation>`
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
  return `<dataValidations count="${rules.length + 1}">${head}${rules.join('')}</dataValidations>`
}

/** Puts the checks where Excel looks for them: it keeps a sheet's elements in one order. */
export function withChecks(xml: string, validations: string): string {
  if (!validations) {
    return xml
  }
  // The checks come before the page's margins and set-up.
  const before = ['<pageMargins', '<pageSetup', '<drawing', '</worksheet>']
    .map((tag) => xml.indexOf(tag))
    .filter((at) => at !== -1)
  const at = Math.min(...before)
  return xml.slice(0, at) + validations + xml.slice(at)
}

function templateFeature<Content>(validations: string): Feature<Content> {
  return {
    files: {
      transform: {
        'xl/worksheets/sheet{id}.xml': {
          transform: (content, _options, { sheetIndex }) =>
            sheetIndex === 0 ? withChecks(content, validations) : content,
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
 * The business's own receipt template: the goods sheet with its hidden keys and guarded headers, a sheet saying
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
