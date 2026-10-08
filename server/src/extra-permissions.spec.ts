import { PERMISSION_KEYS } from '@gulbahor/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

interface UserBody {
  id: string
  fullName: string
  login: string
  phone: string | null
  roles: { id: string }[]
  allLocations: boolean
  locations: { id: string }[]
  extraPermissions: string[]
}

/**
 * A person may be given what their role does not give: a trusted cashier
 * who may sell on credit, without a role of their own for it. It works the
 * moment it is given and stops the moment it is taken away, counts for the
 * manager's word at the till, and is given only by someone who holds it.
 */
describe('Permissions beside the roles', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let cashierId: string
  let registerId: string
  let roleOf: (key: string) => string

  /** The form as it stands, with these extras: what the screen sends. */
  const asForm = (user: UserBody, extraPermissions: string[]) => ({
    fullName: user.fullName,
    login: user.login,
    phone: user.phone,
    roleIds: user.roles.map((role) => role.id),
    allLocations: user.allLocations,
    locationIds: user.locations.map((location) => location.id),
    extraPermissions,
  })

  const give = async (agent: Agent, userId: string, extras: string[]) => {
    const user = (await alpha.get(`/api/users/${userId}`).expect(200)).body as UserBody
    return agent.put(`/api/users/${userId}`).send(asForm(user, extras))
  }

  const hire = async (login: string, fullName: string, template: string) =>
    (
      await alpha
        .post('/api/users')
        .send({
          fullName,
          login,
          password: PASSWORD,
          roleIds: [roleOf(template)],
          allLocations: true,
          locationIds: [],
        })
        .expect(201)
    ).body.id as string

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    const roles = (await alpha.get('/api/roles').expect(200)).body as { id: string; templateKey: string }[]
    roleOf = (key) => roles.find((role) => role.templateKey === key)!.id
    cashierId = await hire('kassir', 'Dilnoza Kassir', 'cashier')
    cashier = await harness.signIn('kassir')
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('opens what the role does not, at once, and closes it at once', async () => {
    await cashier.get('/api/reports/sales').query({ from: '2026-10-01', to: '2026-10-08' }).expect(403)

    const given = (await give(alpha, cashierId, ['reports.sales']).then((response) => response.body)) as UserBody
    expect(given.extraPermissions).toEqual(['reports.sales'])
    const me = (await cashier.get('/api/auth/me').expect(200)).body
    expect(me.user.permissions).toEqual(expect.arrayContaining(['pos.sell', 'reports.sales']))
    await cashier.get('/api/reports/sales').query({ from: '2026-10-01', to: '2026-10-08' }).expect(200)

    await give(alpha, cashierId, []).then((response) => expect(response.status).toBe(200))
    await cashier.get('/api/reports/sales').query({ from: '2026-10-01', to: '2026-10-08' }).expect(403)
  })

  it('makes a person able to give a manager’s word at the till', async () => {
    const sellerId = await hire('sotuvchi', 'Sardor Sotuvchi', 'seller')
    const seller = await harness.signIn('sotuvchi')
    await seller.post('/api/auth/pin').send({ password: PASSWORD, pin: '4821' }).expect(204)
    // A PIN and nothing to allow: not asked.
    const before = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
    expect(before.approvers).toEqual([])

    await give(alpha, sellerId, ['pos.debt']).then((response) => expect(response.status).toBe(200))
    const after = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
    expect(after.approvers).toEqual([
      {
        id: sellerId,
        name: 'Sardor Sotuvchi',
        discount: false,
        returns: false,
        prices: false,
        debts: true,
        partners: false,
      },
    ])
  })

  it('is given only by someone who holds it, one permission at a time', async () => {
    const hr = (
      await alpha
        .post('/api/roles')
        .send({ name: 'Kadrlar', description: null, permissions: ['users.view', 'users.manage', 'reports.sales'] })
        .expect(201)
    ).body.id
    const hrId = (
      await alpha
        .post('/api/users')
        .send({
          fullName: 'Kadrlar bo‘limi',
          login: 'kadr',
          password: PASSWORD,
          roleIds: [hr],
          allLocations: true,
          locationIds: [],
        })
        .expect(201)
    ).body.id
    const people = await harness.signIn('kadr')
    expect(hrId).toBeDefined()

    const beyond = await give(people, cashierId, ['pos.debt'])
    expect(beyond.status).toBe(403)
    expect(beyond.body.error).toMatchObject({
      code: 'ESCALATION',
      message: expect.stringMatching(/^Sizda yo‘q ruxsatni bera olmaysiz: Kassa: .*qarzga sotish$/),
    })
    await give(people, cashierId, ['reports.sales']).then((response) => expect(response.status).toBe(200))

    // What the person already had may stay, though the one editing could not have given it.
    await give(alpha, cashierId, ['reports.sales', 'pos.debt']).then((response) => expect(response.status).toBe(200))
    const kept = await give(people, cashierId, ['reports.sales', 'pos.debt'])
    expect(kept.status).toBe(200)
    // Kept in the order of the list of permissions, not the order they were ticked in.
    expect(kept.body.extraPermissions).toEqual(
      PERMISSION_KEYS.filter((key) => key === 'pos.debt' || key === 'reports.sales'),
    )

    // Everything at once is the owner's role, never an extra; nor is a permission that does not exist.
    expect((await give(alpha, cashierId, ['*'])).status).toBe(400)
    expect((await give(alpha, cashierId, ['pos.fly'])).status).toBe(400)
  })

  it('is written down in the history, by name', async () => {
    const history = (await alpha.get('/api/audit').query({ entity: 'user' }).expect(200)).body.items as {
      action: string
      changes: Record<string, unknown> | null
    }[]
    const granted = history.find(
      (item) => item.action === 'user.update' && JSON.stringify(item.changes ?? {}).includes('qarzga sotish'),
    )
    expect(granted).toBeDefined()
  })

  it('shows one business nothing of another', async () => {
    await beta.get(`/api/users/${cashierId}`).expect(404)
  })
})
