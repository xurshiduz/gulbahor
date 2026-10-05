import { type Agent, type Harness, PASSWORD, startApp } from './testing/harness'

interface Till {
  id: string
  name: string
  isActive: boolean
  isMain: boolean
}
interface Place {
  id: string
  kind: string
  currency: string
  registerId: string | null
  open: boolean
  till: { name: string; main: boolean; mine: boolean } | null
}

/**
 * A shop's main till: the one money is taken from and put into when nobody
 * says which. Every shop with a till has exactly one.
 */
describe('The main till', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let shopId: string
  let first: Till
  let second: Till
  const shifts: string[] = []

  const tills = async () => (await alpha.get('/api/money/registers').expect(200)).body as Till[]
  const mains = async () => (await tills()).filter((till) => till.isMain).map((till) => till.name)
  const open = (till: Till) => alpha.post(`/api/money/registers/${till.id}/main`)

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Dilnoza Kassir',
        login: 'kassir',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'cashier')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    cashier = await harness.signIn('kassir')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it("is the shop's first till, and stays so when more are added", async () => {
    first = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201)).body
    expect(first.isMain).toBe(true)
    second = (await alpha.post('/api/money/registers').send({ name: 'Kassa 2', locationId: shopId }).expect(201)).body
    expect(second.isMain).toBe(false)
    expect(await mains()).toEqual(['Kassa 1'])
  })

  it('is told to whoever lays out a payment, with whose shift is open where', async () => {
    // A till has drawers once it has been opened: the cashier opens the first, the owner the second.
    shifts.push((await cashier.post('/api/shifts').send({ registerId: first.id, cashUzs: 0 }).expect(201)).body.id)
    shifts.push((await alpha.post('/api/shifts').send({ registerId: second.id, cashUzs: 0 }).expect(201)).body.id)
    for (const path of ['/api/partner-payments/accounts', '/api/money/ops/accounts']) {
      const places: Place[] = (await alpha.get(path).expect(200)).body
      const drawer = (till: Till) => places.find((place) => place.registerId === till.id && place.currency === 'UZS')
      expect(drawer(first)).toMatchObject({ open: true, till: { name: 'Kassa 1', main: true, mine: false } })
      expect(drawer(second)).toMatchObject({ open: true, till: { name: 'Kassa 2', main: false, mine: true } })
    }
    // A place that is no till's has no till to name.
    const safe = (await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf', locationId: shopId })).body
    const places: Place[] = (await alpha.get('/api/money/ops/accounts').expect(200)).body
    expect(places.find((place) => place.id === safe.id)).toMatchObject({ till: null, open: true })
  })

  it('is passed to another till by whoever keeps the money in order', async () => {
    expect((await open(second).expect(200)).body).toMatchObject({ name: 'Kassa 2', isMain: true })
    expect(await mains()).toEqual(['Kassa 2'])
    // Said again, nothing changes.
    await open(second).expect(200)
    expect(await mains()).toEqual(['Kassa 2'])

    await cashier.post(`/api/money/registers/${first.id}/main`).expect(403)
    await beta.post(`/api/money/registers/${first.id}/main`).expect(404)
    expect(await mains()).toEqual(['Kassa 2'])
  })

  it('never belongs to a till that is put away', async () => {
    // A till with its shift open is not put away at all.
    expect((await alpha.post(`/api/money/registers/${first.id}/archive`)).status).toBe(409)
    await cashier.post(`/api/shifts/${shifts[0]}/close`).send({ cashUzs: 0 }).expect(200)
    await alpha.post(`/api/shifts/${shifts[1]}/close`).send({ cashUzs: 0 }).expect(200)

    // The first till is put away while the second is main: nothing moves.
    await alpha.post(`/api/money/registers/${first.id}/archive`).expect(200)
    expect(await mains()).toEqual(['Kassa 2'])
    expect((await open(first)).status).toBe(409)
    // Brought back, it is one of the shop's tills again, not the main one.
    expect((await alpha.post(`/api/money/registers/${first.id}/restore`).expect(200)).body.isMain).toBe(false)

    // The main till is put away: the other takes its place.
    await alpha.post(`/api/money/registers/${second.id}/archive`).expect(200)
    expect(await mains()).toEqual(['Kassa 1'])

    // With no till in use the shop has no main till; the first to come back is it.
    await alpha.post(`/api/money/registers/${first.id}/archive`).expect(200)
    expect(await mains()).toEqual([])
    expect((await alpha.post(`/api/money/registers/${second.id}/restore`).expect(200)).body.isMain).toBe(true)
  })
})
