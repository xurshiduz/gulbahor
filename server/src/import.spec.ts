import { guessMapping, readImportRow, type ImportRow } from '@gulbahor/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

/** The header row of the business's China template. */
const HEADERS = [
  'НАИМЕНОВАНИЕ',
  'АРТИКУЛ',
  'V_Размер',
  'V_Цвет',
  'КОЛ-ВО',
  'цена закупки YUAN',
  'Бренд',
  'ПОСТАВЩИК',
  'ЦЕНА ПОСТАВКИ (USD)',
  'цена закупки',
  'РОЗНИЧНАЯ ЦЕНА (UZS)',
  'Variation_id',
  'код фабрике',
  'Производитель',
  'Сезон',
  'Коллекция',
  'доп расход',
  'Пол',
  'КАТЕГОРИЯ',
  'БАРКОД',
]

type Cells = (string | number | null)[]

const sheetRow = (
  name: string,
  sku: string | null,
  size: string | null,
  color: string | null,
  qty: number,
  price: number,
  rest: { barcode?: string; supplier?: string; retail?: number; brand?: string; category?: string } = {},
): Cells => [
  name,
  sku,
  size,
  color,
  qty,
  price,
  rest.brand ?? 'Zara',
  rest.supplier ?? 'Guangzhou Textile',
  null,
  null,
  rest.retail ?? null,
  null,
  'F-100',
  'Xitoy',
  'Лето',
  '2026',
  0.5,
  'Муж',
  rest.category ?? 'Futbolkalar',
  rest.barcode ?? null,
]

const mapping = guessMapping(HEADERS)
const read = (sheet: Cells[]): ImportRow[] =>
  sheet.map((cells, index) => readImportRow(cells, mapping, index + 2)!.value as ImportRow)

/**
 * A spreadsheet in the business's own template, taken into a draft receipt.
 */
describe('Import', () => {
  let harness: Harness
  let alpha: Agent
  let shopId: string

  const request = (rows: ImportRow[], overrides: Record<string, unknown> = {}) => ({
    dryRun: false,
    locationId: shopId,
    docDate: '2026-10-01',
    currency: 'CNY',
    usdRate: 7.1,
    uzsRate: 12_800,
    fileName: 'CHINA.xlsx',
    fileHash: 'a'.repeat(64),
    rows,
    ...overrides,
  })

  const sheet: Cells[] = [
    sheetRow('Futbolka Polo', 'PL-22', 'S', 'Qora', 10, 35.5, { retail: 120_000, barcode: '4006381333931' }),
    sheetRow('Futbolka Polo', 'PL-22', 'M', 'Qora', 20, 35.5, { retail: 120_000 }),
    sheetRow('Futbolka Polo', 'PL-22', 'M', 'Malla', 5, 35.5, { retail: 120_000 }),
    sheetRow('Kamar', null, null, null, 30, 14.2, { category: 'Aksessuarlar', brand: 'NoName' }),
  ]

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
  })

  afterAll(async () => {
    await harness.close()
  })

  it('shows what a file would add without adding it', async () => {
    const preview = await alpha
      .post('/api/receipts/import')
      .send(request(read(sheet), { dryRun: true }))
      .expect(200)
    expect(preview.body).toMatchObject({
      receiptId: null,
      duplicateOf: null,
      rows: 4,
      qty: 65,
      newProducts: ['Futbolka Polo (PL-22)', 'Kamar'],
      newVariants: 4,
      newValues: ['Rang: Malla'],
      newBrands: ['Zara', 'NoName'],
      newCategories: [],
      newSuppliers: ['Guangzhou Textile'],
      problems: [],
    })

    // Nothing of it is there afterwards.
    expect((await alpha.get('/api/products')).body.total).toBe(0)
    expect((await alpha.get('/api/brands')).body).toEqual([])
    expect((await alpha.get('/api/partners')).body.total).toBe(0)
    expect((await alpha.get('/api/receipts')).body.total).toBe(0)
  })

  it('makes the models, their variants and a draft receipt', async () => {
    const done = await alpha
      .post('/api/receipts/import')
      .send(request(read(sheet)))
      .expect(200)
    expect(done.body.receiptNumber).toBe('K-000001')

    const receipt = (await alpha.get(`/api/receipts/${done.body.receiptId}`).expect(200)).body
    expect(receipt).toMatchObject({ status: 'draft', currency: 'CNY', sourceFile: 'CHINA.xlsx' })
    expect(
      receipt.lines.map((line: { qty: number; price: number; extra: number }) => [line.qty, line.price, line.extra]),
    ).toEqual([
      [10, 3550, 50],
      [20, 3550, 50],
      [5, 3550, 50],
      [30, 1420, 50],
    ])
    // One supplier for the whole file sits on the receipt, not on every line.
    expect(receipt.supplierId).not.toBeNull()
    expect(receipt.lines.every((line: { supplierId: string | null }) => line.supplierId === null)).toBe(true)

    const polo = (await alpha.get('/api/products').query({ q: 'PL-22' })).body.items[0]
    expect(polo).toMatchObject({
      name: 'Futbolka Polo',
      brandName: 'Zara',
      categoryName: 'Futbolkalar',
      variantCount: 3,
    })
    const detail = (await alpha.get(`/api/products/${polo.id}`)).body
    expect(detail).toMatchObject({ gender: 'men', season: 'ss', collectionYear: 2026, factoryCode: 'F-100' })
    expect(detail.variants.some((variant: { barcodes: string[] }) => variant.barcodes.includes('4006381333931'))).toBe(
      true,
    )

    // The belt has neither colour nor size: one variant.
    const belt = (await alpha.get('/api/products').query({ q: 'kamar' })).body.items[0]
    expect(belt.variantCount).toBe(1)

    // Posting puts it on hand and sets the retail price from the file.
    await alpha.post(`/api/receipts/${done.body.receiptId}/post`).expect(201)
    expect((await alpha.get(`/api/products/${polo.id}`)).body.prices[0]).toMatchObject({ amount: 120_000_00 })
    expect((await alpha.get('/api/stock').query({ q: 'polo' })).body.items[0].qty).toBe(35)
  })

  it('says when the same file comes a second time, and reuses what it made', async () => {
    const again = await alpha
      .post('/api/receipts/import')
      .send(request(read(sheet), { dryRun: true }))
      .expect(200)
    expect(again.body).toMatchObject({
      duplicateOf: 'K-000001',
      newProducts: [],
      newVariants: 0,
      newValues: [],
      newBrands: [],
      newSuppliers: [],
    })
  })

  it('adds new sizes and barcodes to a model it already knows', async () => {
    const more = read([
      sheetRow('Futbolka Polo', 'PL-22', 'XL', 'Qora', 7, 36, { barcode: '5901234123457' }),
      sheetRow('Futbolka Polo', 'PL-22', 'S', 'Qora', 3, 36, { barcode: '4006381333931' }),
    ])
    const done = await alpha
      .post('/api/receipts/import')
      .send(request(more, { fileHash: 'b'.repeat(64) }))
      .expect(200)
    expect(done.body).toMatchObject({ newProducts: [], newVariants: 1, problems: [] })
    const polo = (await alpha.get('/api/products').query({ q: 'PL-22' })).body.items[0]
    expect(polo.variantCount).toBe(4)
  })

  it('stops the whole file at a bad row and says which', async () => {
    const bad = read([
      sheetRow('Shim', 'SH-1', 'M', 'Qora', 4, 80),
      sheetRow('Shim', 'SH-1', 'L', null, 4, 80),
      sheetRow('Ko‘ylak', 'KY-1', '42', 'Oq', 2, 60, { barcode: '4006381333931' }),
    ])
    const refused = await alpha
      .post('/api/receipts/import')
      .send(request(bad, { fileHash: 'c'.repeat(64) }))
      .expect(200)
    expect(refused.body.receiptId).toBeNull()
    expect(refused.body.problems).toEqual([
      { row: 3, problems: ['Rang yozilmagan'] },
      { row: 4, problems: ['Bu shtrix-kod «Futbolka Polo, Qora, S» da bor'] },
    ])
    expect((await alpha.get('/api/products').query({ q: 'SH-1' })).body.total).toBe(0)
    expect((await alpha.get('/api/receipts')).body.total).toBe(2)
  })

  it('picks the size scale that knows the sizes, and names suppliers per line when there are several', async () => {
    const mixed = read([
      sheetRow('Shim klassik', 'SH-2', '46', 'Qora', 4, 80, { supplier: 'Guangzhou Textile' }),
      sheetRow('Shim klassik', 'SH-2', '48', 'Qora', 4, 80, { supplier: 'Yiwu Trade' }),
    ])
    const done = await alpha
      .post('/api/receipts/import')
      .send(request(mixed, { fileHash: 'd'.repeat(64) }))
      .expect(200)
    expect(done.body).toMatchObject({ newValues: [], newSuppliers: ['Yiwu Trade'] })

    const receipt = (await alpha.get(`/api/receipts/${done.body.receiptId}`)).body
    expect(receipt.supplierId).toBeNull()
    expect(new Set(receipt.lines.map((line: { supplierId: string }) => line.supplierId)).size).toBe(2)
    expect((await alpha.get('/api/receipts').query({ q: 'yiwu' })).body.items[0].supplierName).toBe(
      'Guangzhou Textile, Yiwu Trade',
    )

    const attributes = (await alpha.get('/api/attributes')).body as { id: string; name: string }[]
    const product = (await alpha.get('/api/products').query({ q: 'SH-2' })).body.items[0]
    const detail = (await alpha.get(`/api/products/${product.id}`)).body
    expect(attributes.find((attribute) => attribute.id === detail.axisIds[1])?.name).toBe('O‘lcham (raqamli)')
  })

  it('is for those who may both receive goods and add models', async () => {
    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const accountant = roles.find((item) => item.templateKey === 'accountant')!.id
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Hisobchi',
        login: 'hisobchi',
        password: PASSWORD,
        roleIds: [accountant],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    const agent = await harness.signIn('hisobchi')
    await agent
      .post('/api/receipts/import')
      .send(request(read(sheet)))
      .expect(403)
  })
})
