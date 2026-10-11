import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

/**
 * A screen a person may open asks for nothing they may not have. Each of these
 * was found by opening every screen as someone holding the one permission
 * that shows it: the screen came up, and a list inside it was refused.
 */
describe('What a screen needs beside its own permission', () => {
  let harness: Harness
  let alpha: Agent
  let count = 0

  /** Someone with one permission and nothing else. */
  const only = async (permission: string): Promise<Agent> => {
    count += 1
    const role = (
      await alpha
        .post('/api/roles')
        .send({ name: `Faqat ${permission}`, permissions: [permission] })
        .expect(201)
    ).body
    const login = `yolgiz${count}`
    await alpha
      .post('/api/users')
      .send({ fullName: login, login, password: PASSWORD, roleIds: [role.id], allLocations: true, locationIds: [] })
      .expect(201)
    return harness.signIn(login)
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('stock is filtered by category and brand without the catalogue being open to its reader', async () => {
    const reader = await only('stock.view')
    await reader.get('/api/categories').expect(200)
    await reader.get('/api/brands').expect(200)
    await reader.get('/api/products').expect(403)
  })

  it('payments are filtered by customer by whoever may look at them', async () => {
    for (const permission of ['customers.debts', 'customers.suppliers']) {
      const reader = await only(permission)
      await reader.get('/api/customer-payments').expect(200)
      await reader.get('/api/customers/brief').expect(200)
    }
  })

  it('roles are listed for whoever manages them', async () => {
    const keeper = await only('roles.manage')
    await keeper.get('/api/roles').expect(200)
    await keeper.get('/api/users').expect(403)
  })

  it('an account is put right against a kind of expense by whoever may put it right', async () => {
    const mender = await only('customers.adjust')
    await mender.get('/api/money/categories').expect(200)
    await mender.get('/api/money/ops').expect(403)
  })
})
