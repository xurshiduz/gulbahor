import { randomUUID } from 'node:crypto'

import { daysToBirthday } from '@erp/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100

interface CustomerRow {
  id: string
  name: string
  phone: string
  birthday: string | null
  locationName: string | null
  isActive: boolean
  salesCount: number
  purchases: number
  lastSaleAt: string | null
}

/**
 * The people who buy in the shops: known by their phone, written down by
 * whoever keeps the base or at the till, and what they have bought read from
 * their receipts.
 */
describe('Customers', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent

  let registerId: string
  let shirt: string
  let nodira: CustomerRow

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const sell = (customerId: string | null, qty = 1, agent = cashier) =>
    agent.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId,
      customerId,
      lines: [{ variantId: shirt, qty }],
      payments: [{ method: 'cash', currency: 'UZS', amount: som(100_000) * qty }],
      total: som(100_000) * qty,
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
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
    const draft = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: shirt, qty: 20, price: som(50_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id

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
    await cashier.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('are known by their phone number, one to a business', async () => {
    nodira = (
      await alpha
        .post('/api/customers')
        .send({ name: 'Nodira Karimova', phone: '90 123 45 67', birthday: '1994-03-08', gender: 'female' })
        .expect(201)
    ).body
    expect(nodira).toMatchObject({
      name: 'Nodira Karimova',
      phone: '+998901234567',
      birthday: '1994-03-08',
      isActive: true,
      salesCount: 0,
      purchases: 0,
      lastSaleAt: null,
    })

    // The same number written another way is the same number.
    const twice = await alpha.post('/api/customers').send({ name: 'Boshqa', phone: '+998 (90) 123-45-67' })
    expect(twice.status).toBe(400)
    expect(twice.body.error.fields.phone).toContain('Nodira Karimova')
    expect((await alpha.post('/api/customers').send({ name: 'Raqamsiz' })).status).toBe(400)
    expect((await alpha.post('/api/customers').send({ name: 'Chala', phone: '90 123' })).status).toBe(400)
    // Another business may have a customer with that very number.
    await beta.post('/api/customers').send({ name: 'Nodira', phone: '901234567' }).expect(201)
    expect((await beta.get('/api/customers').expect(200)).body.total).toBe(1)
  })

  it('are found by a name in any script, or by a few digits of the phone', async () => {
    await alpha.post('/api/customers').send({ name: 'G‘ayrat Olimov', phone: '93 555 11 22' }).expect(201)
    const names = async (q: string) =>
      ((await alpha.get('/api/customers').query({ q }).expect(200)).body.items as CustomerRow[]).map(
        (item) => item.name,
      )
    expect(await names('нодира')).toEqual(['Nodira Karimova'])
    expect(await names('gayrat')).toEqual(['G‘ayrat Olimov'])
    expect(await names('1234567')).toEqual(['Nodira Karimova'])
    expect(await names('935551122')).toEqual(['G‘ayrat Olimov'])
    // The till finds them the same way, and tells a cashier no more than who they are.
    const found = (await cashier.get('/api/pos/customers').query({ q: '90123' }).expect(200)).body
    expect(found).toEqual([
      expect.objectContaining({ id: nodira.id, name: 'Nodira Karimova', phone: '+998901234567', groups: [] }),
    ])
  })

  it('are written down at the till the first time they buy, in the shop where they stood', async () => {
    const added = (
      await cashier.post('/api/pos/customers').send({ registerId, name: 'Sardor', phone: '97 700 00 01' }).expect(201)
    ).body
    expect(added).toMatchObject({ id: expect.any(String), name: 'Sardor', phone: '+998977000001', priceType: null })
    expect((await alpha.get(`/api/customers/${added.id}`).expect(200)).body.locationName).toBe('Alpha shop')
    // A cashier serves customers; the base itself is for those who keep it.
    await cashier.get('/api/customers').expect(403)
    await cashier.post('/api/customers').send({ name: 'Yana', phone: '97 700 00 02' }).expect(403)
  })

  it('have bought what their receipts say, less what came back', async () => {
    const first = (await sell(nodira.id, 2).expect(201)).body
    expect(first).toMatchObject({ customerId: nodira.id, customerName: 'Nodira Karimova' })
    await sell(nodira.id).expect(201)
    await sell(null).expect(201)
    const refused = await sell(randomUUID())
    expect(refused.status).toBe(400)
    expect(refused.body.error.fields.customerId).toBeDefined()

    let seen = (await alpha.get(`/api/customers/${nodira.id}`).expect(200)).body as CustomerRow
    expect(seen).toMatchObject({ salesCount: 2, purchases: som(300_000) })
    expect(seen.lastSaleAt).not.toBeNull()

    // One of the two shirts comes back.
    await cashier
      .post('/api/returns')
      .send({
        clientKey: randomUUID(),
        registerId,
        saleId: first.id,
        lines: [{ saleLineId: first.lines[0].id, qty: 1 }],
        total: som(100_000),
        refunds: [{ method: 'cash', currency: 'UZS', amount: som(100_000) }],
      })
      .expect(201)
    seen = (await alpha.get(`/api/customers/${nodira.id}`).expect(200)).body
    expect(seen).toMatchObject({ salesCount: 2, purchases: som(200_000) })

    // The receipts are found by who bought.
    const receipts = (await alpha.get('/api/sales').query({ q: 'nodira' }).expect(200)).body
    expect(receipts.total).toBe(2)
  })

  it('keep their receipts under the name they then had, and are archived rather than lost', async () => {
    const renamed = (
      await alpha
        .put(`/api/customers/${nodira.id}`)
        .send({ name: 'Nodira Aliyeva', phone: '+998901234567', birthday: '1994-03-08', gender: 'female' })
        .expect(200)
    ).body
    expect(renamed.name).toBe('Nodira Aliyeva')
    const old = (await alpha.get('/api/sales').query({ q: 'karimova' }).expect(200)).body
    expect(old.items[0].customerName).toBe('Nodira Karimova')

    expect((await alpha.post(`/api/customers/${nodira.id}/archive`).expect(200)).body.isActive).toBe(false)
    expect((await cashier.get('/api/pos/customers').query({ q: 'nodira' }).expect(200)).body).toEqual([])
    expect((await sell(nodira.id)).status).toBe(400)
    expect((await alpha.get('/api/customers').expect(200)).body.total).toBe(2)
    expect((await alpha.get('/api/customers').query({ status: 'all' }).expect(200)).body.total).toBe(3)
    await alpha.post(`/api/customers/${nodira.id}/restore`).expect(200)
  })

  it('are summed up over the list: how many, how many new, whose birthday is near', async () => {
    const [{ day }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    // Born on this day of the year, thirty years ago; and on the day after tomorrow.
    const [year, month, date] = day.split('-').map(Number)
    const on = (offset: number) => {
      const at = new Date(Date.UTC(year - 30, month - 1, date + offset))
      return at.toISOString().slice(0, 10)
    }
    await alpha
      .post('/api/customers')
      .send({ name: 'Bugun', phone: '90 000 00 01', birthday: on(0) })
      .expect(201)
    await alpha
      .post('/api/customers')
      .send({ name: 'Indin', phone: '90 000 00 02', birthday: on(2) })
      .expect(201)
    await alpha
      .post('/api/customers')
      .send({ name: 'Kech', phone: '90 000 00 03', birthday: on(40) })
      .expect(201)

    const list = (await alpha.get('/api/customers').expect(200)).body
    expect(list.summary.total).toBe(6)
    expect(list.summary.newThisWeek).toBe(6)
    expect(list.summary.lapsed).toBe(0)
    const soon = (await alpha.get('/api/customers').query({ birthdayIn: 7 }).expect(200)).body
    const expected = ['Bugun', 'Indin', ...(daysToBirthday('1994-03-08', day) <= 7 ? ['Nodira Aliyeva'] : [])].sort()
    expect((soon.items as CustomerRow[]).map((item) => item.name).sort()).toEqual(expected)
    expect(list.summary.birthdaysSoon).toBe(expected.length)

    // Someone who bought long ago and not since has lapsed.
    await sql(`UPDATE sales SET sold_at = now() - interval '120 days' WHERE customer_id = $1`, [nodira.id])
    expect((await alpha.get('/api/customers').expect(200)).body.summary.lapsed).toBe(1)
  })

  it('count the days to a birthday the way the calendar does', () => {
    expect(daysToBirthday('1990-10-05', '2026-10-05')).toBe(0)
    expect(daysToBirthday('1990-10-08', '2026-10-05')).toBe(3)
    expect(daysToBirthday('1990-10-04', '2026-10-05')).toBe(364)
    expect(daysToBirthday('1990-01-01', '2026-12-31')).toBe(1)
    // Born on 29 February: 1 March in a year without one.
    expect(daysToBirthday('1992-02-29', '2027-02-27')).toBe(2)
    expect(daysToBirthday('1992-02-29', '2028-02-27')).toBe(2)
  })

  describe('groups and tags', () => {
    let family: { id: string }
    let regular: { id: string }
    let familyPrice: string
    let scarf: string

    const scarfSale = (customerId: string | null, priceTypeId: string | null, total: number) =>
      cashier.post('/api/sales').send({
        clientKey: randomUUID(),
        registerId,
        customerId,
        priceTypeId,
        lines: [{ variantId: scarf, qty: 1 }],
        payments: [{ method: 'cash', currency: 'UZS', amount: total }],
        total,
      })

    beforeAll(async () => {
      const types = (await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]
      const of = (kind: string) => types.find((type) => type.kind === kind)!.id
      // A price nobody picks at the till: it is for the family's group alone.
      familyPrice = (
        await alpha.post('/api/price-types').send({ name: 'Oila', kind: 'other', currency: 'UZS' }).expect(201)
      ).body.id
      const shopId = (await alpha.get('/api/locations')).body.items[0].id
      scarf = (
        await alpha
          .post('/api/products')
          .send({
            name: 'Sharf',
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [
              { priceTypeId: of('retail'), amount: som(50_000), currency: 'UZS' },
              { priceTypeId: familyPrice, amount: som(30_000), currency: 'UZS' },
            ],
          })
          .expect(201)
      ).body.variants[0].id
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [{ variantId: scarf, qty: 20, price: som(25_000) }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    })

    it('give a group its rules: a price, a reminder, what is not done', async () => {
      family = (
        await alpha
          .post('/api/customers/groups')
          .send({ name: 'Oila', priceTypeId: familyPrice, reminder: 'Chek berish kerak', noExchange: true })
          .expect(201)
      ).body
      expect(family).toMatchObject({
        name: 'Oila',
        priceTypeName: 'Oila',
        reminder: 'Chek berish kerak',
        noDebt: false,
        noExchange: true,
        members: 0,
      })
      regular = (
        await alpha.post('/api/customers/groups').send({ name: 'Doimiy', reminder: 'Sumka sovg‘a' }).expect(201)
      ).body

      expect((await alpha.post('/api/customers/groups').send({ name: 'oila' })).body.error.fields.name).toBeDefined()
      const types = (await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]
      const floor = types.find((type) => type.kind === 'min')!.id
      // The floor is not a price anybody buys at.
      const atFloor = await alpha.post('/api/customers/groups').send({ name: 'Pol', priceTypeId: floor })
      expect(atFloor.body.error.fields.priceTypeId).toBeDefined()
      await cashier.get('/api/customers/groups').expect(403)
    })

    it('put a customer in groups and under tags, and find them by either', async () => {
      const card = { name: 'Nodira Aliyeva', phone: '+998901234567', birthday: '1994-03-08', gender: 'female' }
      const saved = (
        await alpha
          .put(`/api/customers/${nodira.id}`)
          .send({ ...card, groupIds: [family.id, regular.id], tags: ['vip', 'toy', 'vip'] })
          .expect(200)
      ).body
      expect(saved.groups.map((group: { name: string }) => group.name)).toEqual(['Oila', 'Doimiy'])
      expect(saved.tags).toEqual(['vip', 'toy'])
      const unknown = await alpha.put(`/api/customers/${nodira.id}`).send({ ...card, groupIds: [randomUUID()] })
      expect(unknown.body.error.fields.groupIds).toBeDefined()

      const names = async (query: Record<string, string>) =>
        ((await alpha.get('/api/customers').query(query).expect(200)).body.items as CustomerRow[]).map(
          (item) => item.name,
        )
      expect(await names({ groupId: family.id })).toEqual(['Nodira Aliyeva'])
      expect(await names({ tag: 'toy' })).toEqual(['Nodira Aliyeva'])
      expect(await names({ tag: 'yoq' })).toEqual([])
      expect(await names({ q: 'vip' })).toEqual(['Nodira Aliyeva'])
      const groups = (await alpha.get('/api/customers/groups').expect(200)).body as { name: string; members: number }[]
      expect(groups.map((group) => [group.name, group.members])).toEqual([
        ['Oila', 1],
        ['Doimiy', 1],
      ])
    })

    it('tell the till what the groups of the customer it picked ask for', async () => {
      const [picked] = (await cashier.get('/api/pos/customers').query({ q: '1234567' }).expect(200)).body
      expect(picked).toEqual({
        id: nodira.id,
        name: 'Nodira Aliyeva',
        phone: '+998901234567',
        groups: ['Oila', 'Doimiy'],
        reminders: ['Chek berish kerak', 'Sumka sovg‘a'],
        discountPercent: 0,
        discountReason: null,
        priceType: { id: familyPrice, name: 'Oila' },
        noDebt: false,
        noLayaway: false,
        noExchange: true,
        debt: { owed: 0, overdue: 0, dueDate: null },
      })
    })

    it("sell to a group's member at the group's price, whoever is at the till", async () => {
      // Nobody picks this price at the till; it comes with the customer.
      const sale = (await scarfSale(nodira.id, familyPrice, som(30_000)).expect(201)).body
      expect(sale).toMatchObject({ total: som(30_000), priceTypeName: 'Oila', customerName: 'Nodira Aliyeva' })
      expect(sale.approvedByName).toBeNull()
      // Without the customer, or for one who is not in the group, there is no such price.
      expect((await scarfSale(null, familyPrice, som(30_000))).body.error.fields.priceTypeId).toBeDefined()
      const other = (await cashier.get('/api/pos/customers').query({ q: 'sardor' }).expect(200)).body[0]
      expect((await scarfSale(other.id, familyPrice, som(30_000))).status).toBe(400)
      // A member may still buy at the retail price.
      await scarfSale(nodira.id, null, som(50_000)).expect(201)
    })

    it('refuse what is not done for the group, and leave the rest alone', async () => {
      const sale = (await scarfSale(nodira.id, null, som(50_000)).expect(201)).body
      const back = (more: Record<string, unknown>) =>
        cashier.post('/api/returns').send({
          clientKey: randomUUID(),
          registerId,
          saleId: sale.id,
          lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
          total: som(50_000),
          ...more,
        })
      const swap = await back({ exchange: { lines: [{ variantId: scarf, qty: 1 }], total: som(50_000) } })
      expect(swap.status).toBe(409)
      expect(swap.body.error.code).toBe('NO_EXCHANGE')
      expect(swap.body.error.message).toContain('almashtirib berilmaydi')
      // Their money back is another matter.
      await back({ refunds: [{ method: 'cash', currency: 'UZS', amount: som(50_000) }] }).expect(201)
    })

    it('stop giving rules once the group is archived', async () => {
      expect((await alpha.post(`/api/customers/groups/${family.id}/archive`).expect(200)).body.isActive).toBe(false)
      const [picked] = (await cashier.get('/api/pos/customers').query({ q: '1234567' }).expect(200)).body
      expect(picked).toMatchObject({
        groups: ['Doimiy'],
        reminders: ['Sumka sovg‘a'],
        priceType: null,
        noExchange: false,
      })
      expect((await scarfSale(nodira.id, familyPrice, som(30_000))).status).toBe(400)
    })
  })

  describe('their own discount', () => {
    let lola: { id: string }

    const buy = (total: number, more: Record<string, unknown> = {}) =>
      cashier.post('/api/sales').send({
        clientKey: randomUUID(),
        registerId,
        customerId: lola.id,
        lines: [{ variantId: shirt, qty: 1 }],
        payments: [{ method: 'cash', currency: 'UZS', amount: total }],
        total,
        ...more,
      })
    const atTill = async () => (await cashier.get('/api/pos/customers').query({ q: 'lola' }).expect(200)).body[0]

    beforeAll(async () => {
      lola = (await alpha.post('/api/customers').send({ name: 'Lola', phone: '99 111 22 33' }).expect(201)).body
    })

    it('is earned by what they have bought, step by step', async () => {
      const tiers = [
        { from: som(1_000_000), percent: 10 },
        { from: som(200_000), percent: 5 },
      ]
      // Kept lowest first, however they were sent.
      expect((await alpha.put('/api/customers/loyalty').send({ tiers }).expect(200)).body).toEqual([
        { from: som(200_000), percent: 5 },
        { from: som(1_000_000), percent: 10 },
      ])
      const twice = await alpha.put('/api/customers/loyalty').send({ tiers: [tiers[0], tiers[0]] })
      expect(twice.status).toBe(400)
      await cashier.put('/api/customers/loyalty').send({ tiers }).expect(403)

      // Nothing bought yet: nothing earned.
      expect(await atTill()).toMatchObject({ discountPercent: 0, discountReason: null })
      await buy(som(100_000)).expect(201)
      await buy(som(100_000)).expect(201)
      // 200 000 bought: the first step.
      expect(await atTill()).toMatchObject({ discountPercent: 5, discountReason: 'Sodiqlik 5%' })
      expect((await alpha.get(`/api/customers/${lola.id}`).expect(200)).body.discountPercent).toBe(5)
    })

    it('comes off by itself at the till, and is written on the receipt apart from what the cashier gave', async () => {
      // The till cannot leave it out: the sum without it is not what the sale comes to.
      expect((await buy(som(100_000))).body.error.code).toBe('PRICE_CHANGED')
      const sale = (await buy(som(95_000)).expect(201)).body
      expect(sale).toMatchObject({
        subtotal: som(100_000),
        discount: som(5000),
        autoDiscount: som(5000),
        autoReason: 'Sodiqlik 5%',
        total: som(95_000),
        approvedByName: null,
      })
      expect(sale.lines[0]).toMatchObject({ discount: som(5000), autoDiscount: som(5000), total: som(95_000) })

      // The cashier's own 10% is counted from what is left, and only that is held against their limit.
      const within = (
        await buy(som(85_500), { lines: [{ variantId: shirt, qty: 1, discount: som(9500) }] }).expect(201)
      ).body
      expect(within).toMatchObject({ discount: som(14_500), autoDiscount: som(5000), total: som(85_500) })
      const over = await buy(som(85_499), { lines: [{ variantId: shirt, qty: 1, discount: som(9501) }] })
      expect(over.body.error.code).toBe('DISCOUNT_OVER_LIMIT')
    })

    it('is the most their groups give, when that is more than they have earned', async () => {
      const staff = (
        await alpha.post('/api/customers/groups').send({ name: 'Xodimlar', discountPercent: 15 }).expect(201)
      ).body
      expect(staff.discountPercent).toBe(15)
      await alpha
        .put(`/api/customers/${lola.id}`)
        .send({ name: 'Lola', phone: '+998991112233', groupIds: [staff.id] })
        .expect(200)
      // Not 15 and 5 together: the greater of the two.
      expect(await atTill()).toMatchObject({ discountPercent: 15, discountReason: 'Xodimlar 15%' })
      const sale = (await buy(som(85_000)).expect(201)).body
      expect(sale).toMatchObject({ autoDiscount: som(15_000), autoReason: 'Xodimlar 15%' })
    })

    it('does not come off a price that is already their own', async () => {
      const types = (await alpha.get('/api/price-types').expect(200)).body as Record<string, unknown>[]
      const wholesale = types.find((type) => type.kind === 'wholesale') as { id: string }
      await alpha
        .put(`/api/price-types/${wholesale.id}`)
        .send({ ...wholesale, tillAccess: 'all' })
        .expect(200)
      // The shirt has no wholesale price, so the retail one stands; but the sale is a wholesale one.
      const sale = (await buy(som(100_000), { priceTypeId: wholesale.id }).expect(201)).body
      expect(sale).toMatchObject({ priceTypeName: 'Ulgurji', autoDiscount: 0, autoReason: null, total: som(100_000) })
    })
  })
})
