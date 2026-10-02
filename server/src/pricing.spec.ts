import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

interface Named {
  id: string
  name: string
}

interface ListRow {
  productId: string
  name: string
  qty: number
  unitCostUzs: number | null
  prices: Record<string, number>
  overrides: number
}

interface Line {
  name: string
  old: number | null
  next: number | null
  unitCost: number | null
  skip: string | null
}

const som = (amount: number) => amount * 100
const usd = (dollars: number) => Math.round(dollars * 100)

/**
 * Prices by rule and in bulk: a change is previewed without touching
 * anything, lands on every price it covers exactly once, is kept, and can be
 * put back.
 */
describe('Pricing', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent

  let retail: string
  let wholesale: string
  let floor: string
  let menId: string
  let shirtsId: string
  let zaraId: string
  let poloId: string
  let poloXl: string

  const list = async (query: Record<string, unknown> = {}, agent = alpha): Promise<Record<string, ListRow>> => {
    const page = (await agent.get('/api/pricing/products').query(query).expect(200)).body
    return Object.fromEntries((page.items as ListRow[]).map((row) => [row.name, row]))
  }

  const reprice = (operation: Record<string, unknown>, extra: Record<string, unknown> = {}, agent = alpha) =>
    agent.post('/api/pricing/reprice').send({ priceTypeId: retail, filter: {}, operation, ...extra })

  const lineOf = (body: { lines: Line[] }, name: string) => body.lines.find((line) => line.name === name)

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)

    const types = (await alpha.get('/api/price-types').expect(200)).body as (Named & { kind: string })[]
    retail = types.find((type) => type.kind === 'retail')!.id
    wholesale = types.find((type) => type.kind === 'wholesale')!.id
    floor = types.find((type) => type.kind === 'min')!.id

    const categories = (await alpha.get('/api/categories').expect(200)).body as (Named & { parentId: string | null })[]
    const shirts = categories.find((category) => category.name === 'Futbolkalar')!
    shirtsId = shirts.id
    menId = shirts.parentId as string
    zaraId = (await alpha.post('/api/brands').send({ name: 'Zara' }).expect(201)).body.id

    const attributes = (await alpha.get('/api/attributes').expect(200)).body as (Named & { values: Named[] })[]
    const size = attributes.find((attribute) => attribute.name === "O'lcham (harfli)")!
    const sizeId = (name: string) => size.values.find((value) => value.name === name)!.id
    const price = (amount: number) => ({ priceTypeId: retail, amount, currency: 'UZS' })

    // A polo in two sizes, the XL dearer by a ninth; a scarf; a cap with no price and no stock.
    const polo = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Polo',
          categoryId: shirtsId,
          brandId: zaraId,
          season: 'ss',
          axisIds: [size.id],
          variants: [{ valueIds: [sizeId('M')] }, { valueIds: [sizeId('XL')], prices: [price(som(100_000))] }],
          prices: [price(som(90_000))],
        })
        .expect(201)
    ).body
    poloId = polo.id
    poloXl = polo.variants[1].id
    const scarf = (
      await alpha
        .post('/api/products')
        .send({ name: 'Sharf', axisIds: [], variants: [{ valueIds: [] }], prices: [price(som(40_000))] })
        .expect(201)
    ).body
    await alpha
      .post('/api/products')
      .send({ name: 'Kepka', axisIds: [], variants: [{ valueIds: [] }] })
      .expect(201)

    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const receive = async (body: Record<string, unknown>) => {
      const draft = await alpha
        .post('/api/receipts')
        .send({ locationId: shopId, docDate: '2026-10-01', uzsRate: 12_000, ...body })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    }
    // The polo is bought for dollars: 4 dollars each, 48 000 so'm at the day's rate.
    await receive({ currency: 'USD', usdRate: 1, lines: [{ variantId: polo.variants[0].id, qty: 10, price: usd(4) }] })
    // The scarf is bought for so'm: 20 000 each.
    await receive({
      currency: 'UZS',
      usdRate: 12_000,
      lines: [{ variantId: scarf.variants[0].id, qty: 5, price: som(20_000) }],
    })
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('the price list', () => {
    it('shows what each model sells for against what it cost', async () => {
      const rows = await list()
      expect(rows.Polo).toMatchObject({
        qty: 10,
        unitCostUzs: som(48_000),
        prices: { [retail]: som(90_000) },
        overrides: 1,
      })
      expect(rows.Sharf).toMatchObject({
        qty: 5,
        unitCostUzs: som(20_000),
        prices: { [retail]: som(40_000) },
        overrides: 0,
      })
      expect(rows.Kepka).toMatchObject({ qty: 0, unitCostUzs: null, prices: {} })
      expect(Object.keys(await list({ presence: 'in' }))).toEqual(['Polo', 'Sharf'])
      expect(Object.keys(await list({ categoryId: menId }))).toEqual(['Polo'])
    })

    it("costs dollar goods at today's rate when asked, and leaves so'm goods as they were", async () => {
      const rows = await list({ uzsRate: 13_000 })
      expect(rows.Polo.unitCostUzs).toBe(som(52_000))
      expect(rows.Sharf.unitCostUzs).toBe(som(20_000))
    })
  })

  describe('a change', () => {
    it('is previewed without changing anything', async () => {
      const preview = (await reprice({ kind: 'percent', percent: 10 }).expect(200)).body
      expect(preview).toMatchObject({ revision: null, total: 3, changed: 2, unchanged: 0, skipped: 1, belowCost: 0 })
      expect(lineOf(preview, 'Polo')).toMatchObject({ old: som(90_000), next: som(99_000), unitCost: som(48_000) })
      expect(lineOf(preview, 'Sharf')).toMatchObject({ old: som(40_000), next: som(44_000) })
      expect(lineOf(preview, 'Kepka')).toMatchObject({ old: null, next: null, skip: 'no_price' })
      // What changes comes first, what was passed over last.
      expect(preview.lines[preview.lines.length - 1].name).toBe('Kepka')
      expect((await list()).Polo.prices[retail]).toBe(som(90_000))
    })

    it('moves every price it covers, and a size priced apart moves with its model', async () => {
      const done = (await reprice({ kind: 'percent', percent: 10 }, { dryRun: false, note: 'Kuzgi narx' }).expect(200))
        .body
      expect(done.revision.number).toBe('NO-000001')
      const rows = await list()
      expect(rows.Polo.prices[retail]).toBe(som(99_000))
      expect(rows.Sharf.prices[retail]).toBe(som(44_000))

      const polo = (await alpha.get(`/api/products/${poloId}`).expect(200)).body
      const xl = polo.variants.find((variant: { id: string }) => variant.id === poloXl)
      expect(xl.prices).toEqual([{ priceTypeId: retail, amount: som(110_000), currency: 'UZS' }])
    })

    it('rounds to the step of the price type', async () => {
      const preview = (await reprice({ kind: 'percent', percent: 3 }).expect(200)).body
      // 99 000 + 3% = 101 970, to the thousand.
      expect(lineOf(preview, 'Polo')?.next).toBe(som(102_000))
      const exact = (await reprice({ kind: 'percent', percent: 3 }, { round: false }).expect(200)).body
      expect(lineOf(exact, 'Polo')?.next).toBe(som(101_970))
    })

    it('adds a sum, and says so when nothing would change', async () => {
      const preview = (await reprice({ kind: 'amount', amount: -som(5000) }, { filter: { q: 'sharf' } }).expect(200))
        .body
      expect(preview).toMatchObject({ total: 1, changed: 1 })
      expect(lineOf(preview, 'Sharf')?.next).toBe(som(39_000))
      await reprice({ kind: 'percent', percent: 0 }, { dryRun: false }).expect(409)
    })

    it('works a price out from cost, at a rate when one is given', async () => {
      const atCost = (await reprice({ kind: 'markup', percent: 80 }).expect(200)).body
      // 48 000 + 80% = 86 400; the scarf 20 000 + 80% = 36 000; the cap has no cost.
      expect(lineOf(atCost, 'Polo')?.next).toBe(som(86_000))
      expect(lineOf(atCost, 'Sharf')?.next).toBe(som(36_000))
      expect(lineOf(atCost, 'Kepka')?.skip).toBe('no_cost')

      const today = (await reprice({ kind: 'markup', percent: 80, uzsRate: 13_000 }).expect(200)).body
      // The dollar went up: 52 000 + 80% = 93 600. The scarf was bought for so'm and stays.
      expect(lineOf(today, 'Polo')).toMatchObject({ next: som(94_000), unitCost: som(52_000) })
      expect(lineOf(today, 'Sharf')?.next).toBe(som(36_000))
    })

    it('counts the prices that would fall under cost', async () => {
      const preview = (await reprice({ kind: 'markup', percent: -10 }).expect(200)).body
      expect(preview.belowCost).toBe(2)
    })
  })

  describe('markup rules', () => {
    it('are kept per kind of goods, one markup for each price type', async () => {
      const general = (
        await alpha
          .post('/api/pricing/rules')
          .send({
            markups: [
              { priceTypeId: retail, base: 'cost', percent: 50 },
              { priceTypeId: wholesale, base: 'retail', percent: -15 },
            ],
          })
          .expect(201)
      ).body
      expect(general).toMatchObject({ categoryId: null, brandId: null, season: null })
      await alpha
        .post('/api/pricing/rules')
        .send({ categoryId: menId, markups: [{ priceTypeId: retail, base: 'cost', percent: 80 }] })
        .expect(201)
      const narrow = (
        await alpha
          .post('/api/pricing/rules')
          .send({
            categoryId: shirtsId,
            brandId: zaraId,
            markups: [{ priceTypeId: retail, base: 'cost', percent: 120 }],
          })
          .expect(201)
      ).body
      expect(narrow).toMatchObject({ categoryName: 'Futbolkalar', brandName: 'Zara' })

      const again = await alpha
        .post('/api/pricing/rules')
        .send({ markups: [{ priceTypeId: retail, base: 'cost', percent: 1 }] })
      expect(again.status).toBe(400)
      const circular = await alpha
        .post('/api/pricing/rules')
        .send({ season: 'aw', markups: [{ priceTypeId: retail, base: 'retail', percent: 5 }] })
      expect(circular.body.error.fields['markups.0.base']).toBeDefined()

      const updated = (
        await alpha
          .put(`/api/pricing/rules/${narrow.id}`)
          .send({
            categoryId: shirtsId,
            brandId: zaraId,
            markups: [{ priceTypeId: retail, base: 'cost', percent: 100 }],
          })
          .expect(200)
      ).body
      expect(updated.markups).toEqual([{ priceTypeId: retail, base: 'cost', percent: 100 }])
      const rules = (await alpha.get('/api/pricing/rules').expect(200)).body as { id: string }[]
      expect(rules.map((rule) => rule.id)).toEqual([general.id, expect.any(String), narrow.id])
    })

    it('give each model the markup of the rule that fits it best', async () => {
      const lookup = (
        await alpha
          .post('/api/pricing/markups')
          .send({ productIds: [poloId] })
          .expect(200)
      ).body
      expect(lookup[poloId]).toEqual([
        { priceTypeId: retail, base: 'cost', percent: 100 },
        { priceTypeId: wholesale, base: 'retail', percent: -15 },
      ])

      const preview = (await reprice({ kind: 'markup' }).expect(200)).body
      // The polo by its own rule: 48 000 + 100%. The scarf by the general one: 20 000 + 50%.
      expect(lineOf(preview, 'Polo')?.next).toBe(som(96_000))
      expect(lineOf(preview, 'Sharf')?.next).toBe(som(30_000))
      expect(lineOf(preview, 'Kepka')?.skip).toBe('no_cost')

      const done = (await reprice({ kind: 'markup' }, { dryRun: false }).expect(200)).body
      expect(done.revision.number).toBe('NO-000002')
    })

    it('work one price type out from another', async () => {
      // Wholesale by rule: the retail price less 15%. 96 000 less 15% is 81 600.
      const byRule = (await reprice({ kind: 'markup' }, { priceTypeId: wholesale, dryRun: false }).expect(200)).body
      expect(lineOf(byRule, 'Polo')).toMatchObject({ old: null, next: som(82_000) })
      expect(lineOf(byRule, 'Kepka')?.skip).toBe('no_source')

      // The floor: no rule names it, so it is set straight from retail.
      const none = (await reprice({ kind: 'markup' }, { priceTypeId: floor }).expect(200)).body
      expect(lineOf(none, 'Polo')?.skip).toBe('no_rule')
      const fromRetail = { kind: 'from_type', priceTypeId: retail, percent: -30 }
      await reprice(fromRetail, { priceTypeId: floor, dryRun: false }).expect(200)
      expect((await list()).Polo.prices).toEqual({
        [retail]: som(96_000),
        [wholesale]: som(82_000),
        [floor]: som(67_000),
      })

      const self = await reprice({ kind: 'from_type', priceTypeId: retail, percent: 5 })
      expect(self.status).toBe(400)
    })

    it('are deleted without touching prices', async () => {
      const [general] = (await alpha.get('/api/pricing/rules').expect(200)).body as { id: string }[]
      await alpha.delete(`/api/pricing/rules/${general.id}`).expect(204)
      expect((await alpha.get('/api/pricing/rules').expect(200)).body).toHaveLength(2)
      expect((await list()).Sharf.prices[retail]).toBe(som(30_000))
    })
  })

  describe('rounding', () => {
    it('can make every price end the same way', async () => {
      const type = { name: 'Chakana', kind: 'retail', currency: 'UZS' }
      await alpha
        .put(`/api/price-types/${retail}`)
        .send({ ...type, roundStep: som(1000), roundEnding: som(9000) })
        .expect(400)
      const saved = (
        await alpha
          .put(`/api/price-types/${retail}`)
          .send({ ...type, roundStep: som(10_000), roundEnding: som(9000) })
          .expect(200)
      ).body
      expect(saved).toMatchObject({ roundStep: som(10_000), roundEnding: som(9000) })

      const preview = (await reprice({ kind: 'percent', percent: 0 }).expect(200)).body
      expect(lineOf(preview, 'Polo')?.next).toBe(som(99_000))
      expect(lineOf(preview, 'Sharf')?.next).toBe(som(29_000))
    })
  })

  describe('history', () => {
    it('lists every change, newest first', async () => {
      const page = (await alpha.get('/api/pricing/revisions').expect(200)).body
      expect(page.total).toBe(4)
      expect(page.items[3]).toMatchObject({
        number: 'NO-000001',
        priceTypeName: 'Chakana',
        summary: '+10%',
        note: 'Kuzgi narx',
        changed: 2,
        createdByName: 'Alpha Owner',
        revertedByNumber: null,
      })
      expect(page.items[2].summary).toBe("Tannarxdan qoida bo'yicha")
      expect(page.items[0].summary).toBe('Chakana −30%')
    })

    it('puts a change back, once', async () => {
      const page = (await alpha.get('/api/pricing/revisions').expect(200)).body
      const second = page.items.find((item: { number: string }) => item.number === 'NO-000002')
      const undone = (await alpha.post(`/api/pricing/revisions/${second.id}/revert`).expect(200)).body
      expect(undone).toMatchObject({ revision: { number: 'NO-000005' }, changed: 2, skipped: 0 })

      const rows = await list()
      expect(rows.Polo.prices[retail]).toBe(som(99_000))
      expect(rows.Sharf.prices[retail]).toBe(som(44_000))
      const polo = (await alpha.get(`/api/products/${poloId}`).expect(200)).body
      const xl = polo.variants.find((variant: { id: string }) => variant.id === poloXl)
      expect(xl.prices[0].amount).toBe(som(110_000))

      await alpha.post(`/api/pricing/revisions/${second.id}/revert`).expect(409)
      const after = (await alpha.get('/api/pricing/revisions').expect(200)).body.items
      expect(after[0]).toMatchObject({
        number: 'NO-000005',
        summary: 'NO-000002 qaytarildi',
        revertsNumber: 'NO-000002',
      })
      expect(after.find((item: { number: string }) => item.number === 'NO-000002').revertedByNumber).toBe('NO-000005')
    })

    it('leaves alone what was changed again since', async () => {
      // The first change set 99 000 and 44 000; both stand again, so it can be put back in full.
      const page = (await alpha.get('/api/pricing/revisions').expect(200)).body
      const first = page.items.find((item: { number: string }) => item.number === 'NO-000001')
      // But first the scarf moves on, by itself.
      await reprice(
        { kind: 'amount', amount: som(10_000) },
        { filter: { q: 'sharf' }, round: false, dryRun: false },
      ).expect(200)

      const undone = (await alpha.post(`/api/pricing/revisions/${first.id}/revert`).expect(200)).body
      // The polo and its XL go back; the scarf, changed since, stays where it was put.
      expect(undone).toMatchObject({ changed: 1, skipped: 1 })
      const rows = await list()
      expect(rows.Polo.prices[retail]).toBe(som(90_000))
      expect(rows.Sharf.prices[retail]).toBe(som(54_000))
    })

    it('takes away a price that the change had created', async () => {
      const page = (await alpha.get('/api/pricing/revisions').expect(200)).body
      const wholesaleChange = page.items.find((item: { number: string }) => item.number === 'NO-000003')
      await alpha.post(`/api/pricing/revisions/${wholesaleChange.id}/revert`).expect(200)
      expect((await list()).Polo.prices[wholesale]).toBeUndefined()
    })
  })

  describe('rights and separation', () => {
    it('lets only those trusted with prices change them, and hides cost from the rest', async () => {
      const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
      const hire = async (login: string, templateKey: string) => {
        const roleId = roles.find((role) => role.templateKey === templateKey)!.id
        await alpha
          .post('/api/users')
          .send({ fullName: login, login, password: PASSWORD, roleIds: [roleId], allLocations: true, locationIds: [] })
          .expect(201)
        return harness.signIn(login)
      }
      const keeper = await hire('omborchi', 'warehouse')
      await reprice({ kind: 'percent', percent: 5 }, {}, keeper).expect(403)
      await keeper.post('/api/pricing/rules').send({ season: 'aw', markups: [] }).expect(403)
      // The keeper sees prices, and does not see what the goods cost.
      const rows = await list({}, keeper)
      expect(rows.Polo.prices[retail]).toBe(som(90_000))
      expect(rows.Polo.unitCostUzs).toBeNull()
    })

    it('shows one business nothing of another', async () => {
      expect(await list({}, beta)).toEqual({})
      expect((await beta.get('/api/pricing/revisions').expect(200)).body.total).toBe(0)
      expect((await beta.get('/api/pricing/rules').expect(200)).body).toEqual([])
      const foreign = await reprice({ kind: 'percent', percent: 5 }, {}, beta)
      expect(foreign.status).toBe(400)
      const [revision] = (await alpha.get('/api/pricing/revisions').expect(200)).body.items
      await beta.post(`/api/pricing/revisions/${revision.id}/revert`).expect(404)
    })
  })
})
