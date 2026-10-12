import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)

interface Named {
  id: string
  name: string
}

/**
 * The prices a receipt sets as it is posted (KEYINGI-REJA, 16.4): those written
 * on its lines, and — for a model with no price of a type yet — what that
 * type's formula makes of what the goods just cost. New goods are not left
 * without a price; a price that stands is not touched; all of it is one
 * revision of the price history, which can be put back.
 */
describe('The prices a receipt sets', () => {
  let harness: Harness
  let alpha: Agent
  let keeper: Agent

  let shopId: string
  let retail: string
  let wholesale: string
  let floor: string

  const product = async (name: string, retailPrice?: number, brandId?: string) => {
    const made = (
      await alpha
        .post('/api/products')
        .send({
          name,
          brandId,
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: retailPrice ? [{ priceTypeId: retail, amount: retailPrice, currency: 'UZS' }] : [],
        })
        .expect(201)
    ).body
    return { id: made.id as string, variantId: made.variants[0].id as string }
  }
  const receive = async (body: Record<string, unknown>, agent = alpha) => {
    const draft = (
      await agent
        .post('/api/receipts')
        .send({ locationId: shopId, docDate: '2026-10-01', currency: 'UZS', ...body })
        .expect(201)
    ).body
    await agent.post(`/api/receipts/${draft.id}/post`).expect(201)
    return draft as { id: string; number: string }
  }
  const pricesOf = async (productId: string) =>
    (
      (await alpha.get('/api/pricing/products').query({ size: 200 }).expect(200)).body.items as {
        productId: string
        prices: Record<string, number>
      }[]
    ).find((row) => row.productId === productId)!.prices
  const revisions = async () =>
    (await alpha.get('/api/pricing/revisions').expect(200)).body.items as {
      id: string
      number: string
      priceTypeName: string
      summary: string
      changed: number
    }[]

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    const types = (await alpha.get('/api/price-types').expect(200)).body as (Named & Record<string, unknown>)[]
    const byKind = (kind: string) =>
      types.find((type) => (kind === 'wholesale' ? type.name === 'Ulgurji' : type.kind === kind))!
    retail = byKind('retail').id
    wholesale = byKind('wholesale').id
    floor = byKind('min').id
    // Retail is worked out from cost, wholesale from retail; the floor is kept by hand.
    const way = async (type: Named & Record<string, unknown>, formula: Record<string, unknown>) => {
      const { id, isActive: _active, formula: _formula, ...fields } = type
      await alpha
        .put(`/api/price-types/${id}`)
        .send({ ...fields, roundStep: som(1000), roundEnding: 0, formula })
        .expect(200)
    }
    await way(byKind('retail'), { base: 'cost', percent: 50 })
    await way(byKind('wholesale'), { base: 'retail', percent: -10 })

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Omborchi',
        login: 'omborchi',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'warehouse')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    keeper = await harness.signIn('omborchi')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('gives new goods a price by the formula, and leaves a price that stands alone', async () => {
    const fresh = await product('Yangi ko‘ylak')
    const known = await product('Eski sharf', som(90_000))
    const receipt = await receive({
      lines: [
        { variantId: fresh.variantId, qty: 10, price: som(40_000) },
        { variantId: known.variantId, qty: 5, price: som(30_000) },
      ],
    })
    // 40 000 + 50%; wholesale a tenth under the retail price it has just been given. No rule names the floor.
    expect(await pricesOf(fresh.id)).toEqual({ [retail]: som(60_000), [wholesale]: som(54_000) })
    // The scarf's retail price stands; its wholesale one was missing, and comes from that.
    expect(await pricesOf(known.id)).toEqual({ [retail]: som(90_000), [wholesale]: som(81_000) })
    expect((await pricesOf(fresh.id))[floor]).toBeUndefined()

    const [revision] = await revisions()
    expect(revision).toMatchObject({
      summary: `${receipt.number} kirimidan`,
      priceTypeName: 'Chakana, Ulgurji',
      changed: 2,
    })
  })

  it('tells the screen, for each model, the formula of every type and what it sells for now', async () => {
    const sock = await product('Paypoq')
    const tie = await product('Galstuk', som(45_000))
    const lookup = (
      await alpha
        .post('/api/pricing/formulas')
        .send({ productIds: [sock.id, tie.id] })
        .expect(200)
    ).body
    // Each with whose rule it is: none here but the types' own ways.
    const formulas = [
      { priceTypeId: retail, base: 'cost', percent: 50, amount: 0, rule: null },
      { priceTypeId: wholesale, base: 'retail', percent: -10, amount: 0, rule: null },
    ]
    expect(lookup[sock.id]).toEqual({ formulas: expect.arrayContaining(formulas), prices: {} })
    expect(lookup[tie.id]).toEqual({ formulas: expect.arrayContaining(formulas), prices: { [retail]: som(45_000) } })
  })

  it('works the price out from what the goods cost with their share of the expenses, rounded up', async () => {
    const coat = await product('Palto')
    await receive({
      lines: [{ variantId: coat.variantId, qty: 4, price: som(100_000) }],
      expenses: [{ name: 'Yo‘l', amount: som(10_100), currency: 'UZS', basis: 'quantity' }],
    })
    // 102 525 each; half again is 153 787,50 — up to the thousand.
    expect((await pricesOf(coat.id))[retail]).toBe(som(154_000))
  })

  it('takes what is written on a line over the formula, and over what stood', async () => {
    const dress = await product('Libos')
    await receive({ lines: [{ variantId: dress.variantId, qty: 2, price: som(50_000), retailPrice: som(99_000) }] })
    // Retail as written; wholesale from it.
    expect(await pricesOf(dress.id)).toEqual({ [retail]: som(99_000), [wholesale]: som(90_000) })
    const before = (await revisions()).length
    await receive({ lines: [{ variantId: dress.variantId, qty: 2, price: som(60_000), retailPrice: som(120_000) }] })
    // The new retail price is set; the wholesale one stands, and is not worked out again.
    expect(await pricesOf(dress.id)).toEqual({ [retail]: som(120_000), [wholesale]: som(90_000) })
    expect(await revisions()).toHaveLength(before + 1)
    // The same goods again at the same price: nothing changes, and nothing is written to the history.
    await receive({ lines: [{ variantId: dress.variantId, qty: 1, price: som(60_000), retailPrice: som(120_000) }] })
    expect(await revisions()).toHaveLength(before + 1)
  })

  it('gives someone who may not set prices the formula alone', async () => {
    const hat = await product('Shlyapa')
    await receive(
      { lines: [{ variantId: hat.variantId, qty: 3, price: som(20_000), retailPrice: som(500_000) }] },
      keeper,
    )
    // What the keeper typed is not theirs to set; the rule's price is: 20 000 + 50%.
    expect((await pricesOf(hat.id))[retail]).toBe(som(30_000))
  })

  it('is put back as one change', async () => {
    const boots = await product('Etik')
    const receipt = await receive({ lines: [{ variantId: boots.variantId, qty: 2, price: som(200_000) }] })
    expect(await pricesOf(boots.id)).toEqual({ [retail]: som(300_000), [wholesale]: som(270_000) })
    const revision = (await revisions()).find((item) => item.summary === `${receipt.number} kirimidan`)!
    const undone = (await alpha.post(`/api/pricing/revisions/${revision.id}/revert`).expect(200)).body
    expect(undone).toMatchObject({ changed: 1, skipped: 0 })
    expect(await pricesOf(boots.id)).toEqual({})
  })

  it('works out a formula typed into a line’s own field, though a price stands', async () => {
    const skirt = await product('Yubka', som(90_000))
    const draft = (
      await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [
            {
              variantId: skirt.variantId,
              qty: 4,
              price: som(40_000),
              priceFormulas: {
                [retail]: { base: 'cost', percent: 30 },
                [wholesale]: { base: 'retail', percent: -20 },
              },
            },
          ],
        })
        .expect(201)
    ).body
    // The draft keeps what was typed as it was typed.
    expect(draft.lines[0].priceFormulas).toEqual({
      [retail]: { base: 'cost', percent: 30, amount: 0 },
      [wholesale]: { base: 'retail', percent: -20, amount: 0 },
    })
    const copy = (await alpha.post(`/api/receipts/${draft.id}/copy`).expect(201)).body
    expect(copy.lines[0].priceFormulas).toEqual(draft.lines[0].priceFormulas)
    await alpha.delete(`/api/receipts/${copy.id}`).expect(204)

    await alpha.post(`/api/receipts/${draft.id}/post`).expect(201)
    // 40 000 + 30%; wholesale a fifth under that, up to the thousand.
    expect(await pricesOf(skirt.id)).toEqual({ [retail]: som(52_000), [wholesale]: som(42_000) })
  })

  it('prices a receipt its own way where the receipt says so', async () => {
    const fresh = await product('Yangi shim')
    const known = await product('Eski shim', som(70_000))
    const lines = [
      { variantId: fresh.variantId, qty: 2, price: som(30_000) },
      { variantId: known.variantId, qty: 2, price: som(30_000) },
    ]
    // Twice what they cost for this shipment, and no wholesale price worked out at all.
    const pricing = { [retail]: { formula: { base: 'cost', percent: 100 } }, [wholesale]: { skip: true } }
    const draft = (
      await alpha
        .post('/api/receipts')
        .send({ locationId: shopId, docDate: '2026-10-01', currency: 'UZS', pricing, lines })
        .expect(201)
    ).body
    expect(draft.pricing).toEqual({
      [retail]: { skip: false, formula: { base: 'cost', percent: 100, amount: 0 }, all: false },
      [wholesale]: { skip: true, formula: null, all: false },
    })
    await alpha.post(`/api/receipts/${draft.id}/post`).expect(201)
    expect(await pricesOf(fresh.id)).toEqual({ [retail]: som(60_000) })
    // The price that stands is left alone.
    expect(await pricesOf(known.id)).toEqual({ [retail]: som(70_000) })

    // "For the goods that have a price too": the rules themselves, this time, for every model on the receipt.
    await receive({ pricing: { [retail]: { all: true } }, lines: [{ ...lines[1], price: som(50_000) }] })
    // Two at 30 000 and two at 50 000 are on hand, but the price is of what this receipt's goods cost: + 50%.
    expect(await pricesOf(known.id)).toEqual({ [retail]: som(75_000), [wholesale]: som(68_000) })
  })

  it('names the rule a formula comes from', async () => {
    const zaraId = (await alpha.post('/api/brands').send({ name: 'Zara' }).expect(201)).body.id
    await alpha
      .post('/api/pricing/rules')
      .send({ brandId: zaraId, markups: [{ priceTypeId: retail, base: 'cost', percent: 80 }] })
      .expect(201)
    const jacket = await product('Kurtka', undefined, zaraId)
    const lookup = (
      await alpha
        .post('/api/pricing/formulas')
        .send({ productIds: [jacket.id] })
        .expect(200)
    ).body
    expect(lookup[jacket.id].formulas).toEqual(
      expect.arrayContaining([
        { priceTypeId: retail, base: 'cost', percent: 80, amount: 0, rule: 'Zara' },
        // The brand's rule says nothing of wholesale: that is left to the type's own way.
        { priceTypeId: wholesale, base: 'retail', percent: -10, amount: 0, rule: null },
      ]),
    )
    await receive({ lines: [{ variantId: jacket.variantId, qty: 1, price: som(100_000) }] })
    expect(await pricesOf(jacket.id)).toEqual({ [retail]: som(180_000), [wholesale]: som(162_000) })
  })

  it('does not let someone who may not set prices price a receipt their own way', async () => {
    const scarf = await product('Ro‘mol', som(40_000))
    const cap = await product('Kepka')
    await receive(
      {
        pricing: { [retail]: { formula: { base: 'cost', percent: 300 }, all: true } },
        lines: [
          { variantId: scarf.variantId, qty: 1, price: som(10_000) },
          {
            variantId: cap.variantId,
            qty: 1,
            price: som(10_000),
            priceFormulas: { [retail]: { base: 'cost', percent: 200 } },
          },
        ],
      },
      keeper,
    )
    // The rules alone: nothing for the scarf, which has its price; the cap at cost + 50%.
    expect((await pricesOf(scarf.id))[retail]).toBe(som(40_000))
    expect((await pricesOf(cap.id))[retail]).toBe(som(15_000))
  })

  it('refuses a formula for a price type it does not keep, and the retail price out of itself', async () => {
    const glove = await product('Qo‘lqop')
    const send = (body: Record<string, unknown>) =>
      alpha.post('/api/receipts').send({ locationId: shopId, docDate: '2026-10-01', currency: 'UZS', ...body })
    const line = { variantId: glove.variantId, qty: 1, price: som(10_000) }
    const circular = await send({ lines: [{ ...line, priceFormulas: { [retail]: { base: 'retail', percent: -5 } } }] })
    expect(circular.status).toBe(400)
    expect(circular.body.error.fields).toEqual({
      'lines.0.priceFormulas': 'Chakana narxning o‘zi chakana narxdan hisoblanmaydi',
    })
    const unknown = await send({ lines: [line], pricing: { [shopId]: { skip: true } } })
    expect(unknown.status).toBe(400)
    expect(unknown.body.error.fields).toEqual({ pricing: 'Narx turi topilmadi' })
  })

  it('sets nothing where no formula says how', async () => {
    const types = (await alpha.get('/api/price-types').expect(200)).body as (Named & Record<string, unknown>)[]
    for (const type of types.filter((item) => item.formula)) {
      const { id, isActive: _active, formula: _formula, ...fields } = type
      await alpha
        .put(`/api/price-types/${id}`)
        .send({ ...fields, formula: null })
        .expect(200)
    }
    const before = (await revisions()).length
    const belt = await product('Kamar')
    await receive({ lines: [{ variantId: belt.variantId, qty: 2, price: som(15_000) }] })
    expect(await pricesOf(belt.id)).toEqual({})
    expect(await revisions()).toHaveLength(before)
  })
})
