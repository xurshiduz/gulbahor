import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)

interface AccountRow {
  id: string
  kind: string
  name: string
  locationId: string | null
  locationName: string | null
  locationIds: string[]
  locationNames: string[]
}

/**
 * A card that serves several shops: offered at their tills and to the
 * people who work in them, and nowhere else.
 */
describe('Accounts shared between shops', () => {
  let harness: Harness
  let alpha: Agent
  let third: Agent

  const shops: Record<'one' | 'two' | 'three', string> = { one: '', two: '', three: '' }
  const tills: Record<'one' | 'two' | 'three', string> = { one: '', two: '', three: '' }
  let sharedId: string
  let everywhereId: string
  let shirt: string

  const cardsAt = async (till: string, agent = alpha): Promise<string[]> =>
    ((await agent.get(`/api/pos/context/${till}`).expect(200)).body.cards as { name: string }[]).map(
      (card) => card.name,
    )

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    shops.one = (await alpha.get('/api/locations')).body.items[0].id
    shops.two = (await alpha.post('/api/locations').send({ name: 'Ikkinchi', kind: 'store' }).expect(201)).body.id
    shops.three = (await alpha.post('/api/locations').send({ name: 'Uchinchi', kind: 'store' }).expect(201)).body.id
    for (const key of ['one', 'two', 'three'] as const) {
      tills[key] = (
        await alpha
          .post('/api/money/registers')
          .send({ name: `Kassa ${key}`, locationId: shops[key] })
          .expect(201)
      ).body.id
    }

    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    shirt = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Futbolka',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(100_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    for (const key of ['one', 'three'] as const) {
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shops[key],
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [{ variantId: shirt, qty: 5, price: som(50_000) }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
      await alpha.post('/api/shifts').send({ registerId: tills[key], cash: {} }).expect(201)
    }

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Uchinchi Menejer',
        login: 'uchinchi',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'store_manager')!.id],
        allLocations: false,
        locationIds: [shops.three],
      })
      .expect(201)
    third = await harness.signIn('uchinchi')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('are set up with the shops they serve; none means every shop', async () => {
    const shared = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'card', name: 'Humo', last4: '3073', locationIds: [shops.one, shops.two] })
        .expect(201)
    ).body as AccountRow
    sharedId = shared.id
    // Two shops: no single one is its own.
    expect(shared).toMatchObject({ locationId: null, locationName: null, locationNames: ['Alpha shop', 'Ikkinchi'] })
    expect([...shared.locationIds].sort()).toEqual([shops.one, shops.two].sort())

    const everywhere = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Uzcard' }).expect(201))
      .body as AccountRow
    everywhereId = everywhere.id
    expect(everywhere).toMatchObject({ locationId: null, locationIds: [], locationNames: [] })

    // The old way of naming one shop still stands, and is the same thing as a list of one.
    const single = (
      await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Visa', locationId: shops.three }).expect(201)
    ).body as AccountRow
    expect(single).toMatchObject({ locationId: shops.three, locationName: 'Uchinchi', locationIds: [shops.three] })

    // A terminal stands in one place.
    const terminal = await alpha
      .post('/api/money/accounts')
      .send({ kind: 'terminal', name: 'Terminal', locationIds: [shops.one, shops.two] })
    expect(terminal.status).toBe(400)
    expect(terminal.body.error.fields.locationIds).toBeDefined()
    const nowhere = await alpha
      .post('/api/money/accounts')
      .send({ kind: 'card', name: 'Boshqa', locationIds: [shops.one, randomUUID()] })
    expect(nowhere.body.error.fields.locationIds).toBe('Joy topilmadi')
  })

  it('are offered at the tills of their shops only', async () => {
    expect(await cardsAt(tills.one)).toEqual(['Humo', 'Uzcard'])
    expect(await cardsAt(tills.two)).toEqual(['Humo', 'Uzcard'])
    expect(await cardsAt(tills.three)).toEqual(['Uzcard', 'Visa'])

    const pay = (till: string, accountId: string) =>
      alpha.post('/api/sales').send({
        clientKey: randomUUID(),
        registerId: till,
        lines: [{ variantId: shirt, qty: 1 }],
        payments: [{ method: 'card', accountId, amount: som(100_000) }],
        total: som(100_000),
      })
    await pay(tills.one, sharedId).expect(201)
    // The third shop's till cannot take money on a card that is not its own, whatever the screen sends.
    const refused = await pay(tills.three, sharedId)
    expect(refused.status).toBe(400)
    expect(refused.body.error.fields['payments.0.accountId']).toBe('Karta topilmadi')
    await pay(tills.three, everywhereId).expect(201)
  })

  it('are used by those who work in one of their shops', async () => {
    const places = (await third.get('/api/money/ops/accounts').expect(200)).body as AccountRow[]
    const cards = places.filter((account) => account.kind === 'card').map((account) => account.name)
    expect(cards).toEqual(['Uzcard', 'Visa'])

    const categories = (await alpha.get('/api/money/categories').expect(200)).body as { id: string; name: string }[]
    const spend = (accountId: string) =>
      third.post('/api/money/ops').send({
        clientKey: randomUUID(),
        kind: 'expense',
        categoryId: categories.find((item) => item.name === 'Oshxona')!.id,
        lines: [{ accountId, amount: som(10_000) }],
        total: som(10_000),
      })
    const foreign = await spend(sharedId)
    expect(foreign.status).toBe(400)
    expect(foreign.body.error.fields['lines.0.accountId']).toBe('Hisob topilmadi')
    await spend(everywhereId).expect(201)
  })

  it('change their shops when the card is given to another', async () => {
    const moved = (
      await alpha
        .put(`/api/money/accounts/${sharedId}`)
        .send({ kind: 'card', name: 'Humo', last4: '3073', locationIds: [shops.two, shops.three] })
        .expect(200)
    ).body as AccountRow
    expect(moved.locationNames).toEqual(['Ikkinchi', 'Uchinchi'])
    expect(await cardsAt(tills.one)).toEqual(['Uzcard'])
    expect(await cardsAt(tills.three, third)).toEqual(['Humo', 'Uzcard', 'Visa'])

    // Left with one shop, it is that shop's card like any other.
    const one = (
      await alpha
        .put(`/api/money/accounts/${sharedId}`)
        .send({ kind: 'card', name: 'Humo', last4: '3073', locationIds: [shops.two] })
        .expect(200)
    ).body as AccountRow
    expect(one).toMatchObject({ locationId: shops.two, locationName: 'Ikkinchi', locationIds: [shops.two] })
    // And with none, every shop's.
    const all = (
      await alpha.put(`/api/money/accounts/${sharedId}`).send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(200)
    ).body as AccountRow
    expect(all).toMatchObject({ locationId: null, locationIds: [] })
    expect(await cardsAt(tills.one)).toEqual(['Humo', 'Uzcard'])
  })

  it("keep a till's own drawer in the till's shop", async () => {
    const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
    const drawer = accounts.find((account) => account.kind === 'cash' && account.locationId === shops.three)
    expect(drawer).toMatchObject({ locationIds: [shops.three], locationNames: ['Uchinchi'] })
  })
})
