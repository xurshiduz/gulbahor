import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import type { DataSource } from 'typeorm'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

/**
 * Runs against the test database with two businesses in it. The point of
 * most of these is that one business can never reach the other, and that
 * the rules which protect a business from its own people hold.
 */
describe('API', () => {
  let harness: Harness
  let app: NestExpressApplication
  let dataSource: DataSource
  let alpha: Agent
  let beta: Agent
  let signIn: Harness['signIn']

  beforeAll(async () => {
    harness = await startApp()
    ;({ app, dataSource, alpha, beta, signIn } = harness)
  })

  afterAll(async () => {
    await harness.close()
  })

  describe('sign-in', () => {
    it('refuses a wrong password without saying which part was wrong', async () => {
      const response = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'alpha', password: 'nope-nope' })
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS')

      const unknown = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'nobody', password: 'nope-nope' })
      expect(unknown.body.error).toEqual(response.body.error)
    })

    it('closes every route to visitors', async () => {
      for (const path of ['/api/auth/me', '/api/users', '/api/locations', '/api/roles', '/api/audit', '/api/org']) {
        await request(app.getHttpServer()).get(path).expect(401)
      }
    })

    it('rotates the refresh token and keeps the session', async () => {
      const agent = await signIn('alpha')
      await agent.post('/api/auth/refresh').expect(204)
      await agent.get('/api/auth/me').expect(200)
    })
  })

  describe('isolation between businesses', () => {
    it('shows each business only its own places and people', async () => {
      const alphaPlaces = await alpha.get('/api/locations').expect(200)
      const betaPlaces = await beta.get('/api/locations').expect(200)
      expect(alphaPlaces.body.items.map((item: { name: string }) => item.name)).toEqual(['Alpha shop'])
      expect(betaPlaces.body.items.map((item: { name: string }) => item.name)).toEqual(['Beta shop'])

      const alphaPeople = await alpha.get('/api/users').expect(200)
      expect(alphaPeople.body.items.map((item: { login: string }) => item.login)).toEqual(['alpha'])
    })

    it('cannot read or change another business’s rows by id', async () => {
      const betaPlace = (await beta.get('/api/locations')).body.items[0]
      const betaOwner = (await beta.get('/api/users')).body.items[0]

      await alpha.get(`/api/locations/${betaPlace.id}`).expect(404)
      await alpha.put(`/api/locations/${betaPlace.id}`).send({ name: 'Stolen', kind: 'store' }).expect(404)
      await alpha.post(`/api/locations/${betaPlace.id}/archive`).expect(404)
      await alpha.get(`/api/users/${betaOwner.id}`).expect(404)
      await alpha.post(`/api/users/${betaOwner.id}/block`).expect(404)

      expect((await beta.get(`/api/locations/${betaPlace.id}`)).body.name).toBe('Beta shop')
    })

    it('cannot attach its people to another business’s roles or places', async () => {
      const betaRole = (await beta.get('/api/roles')).body[0]
      const betaPlace = (await beta.get('/api/locations')).body.items[0]
      const alphaRole = (await alpha.get('/api/roles')).body.find((role: { templateKey: string }) => role.templateKey === 'cashier')

      const base = { fullName: 'Mole', login: 'mole', password: PASSWORD, allLocations: true, locationIds: [] }
      await alpha.post('/api/users').send({ ...base, roleIds: [betaRole.id] }).expect(400)
      await alpha
        .post('/api/users')
        .send({ ...base, roleIds: [alphaRole.id], allLocations: false, locationIds: [betaPlace.id] })
        .expect(400)
    })

    it('keeps logins unique across businesses but lets names repeat', async () => {
      const cashier = (await beta.get('/api/roles')).body.find((role: { templateKey: string }) => role.templateKey === 'cashier')
      const taken = await beta
        .post('/api/users')
        .send({ fullName: 'Copy', login: 'ALPHA', password: PASSWORD, roleIds: [cashier.id], allLocations: true, locationIds: [] })
      expect(taken.status).toBe(400)
      expect(taken.body.error.fields.login).toBeDefined()

      // The same shop name in two businesses is fine.
      await beta.post('/api/locations').send({ name: 'Alpha shop', kind: 'store' }).expect(201)
    })

    it('returns nothing to a query that names no business', async () => {
      const rows = await dataSource.query('SELECT count(*)::int AS count FROM users')
      expect(rows[0].count).toBe(0)
    })
  })

  describe('rules inside a business', () => {
    let cashierRoleId: string
    let managerRoleId: string
    let ownerRoleId: string
    let shopId: string

    beforeAll(async () => {
      const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
      cashierRoleId = roles.find((role) => role.templateKey === 'cashier')!.id
      managerRoleId = roles.find((role) => role.templateKey === 'manager')!.id
      ownerRoleId = roles.find((role) => role.templateKey === 'owner')!.id
      shopId = (await alpha.get('/api/locations')).body.items[0].id
    })

    it('numbers places by kind and refuses a repeated name', async () => {
      const second = await alpha.post('/api/locations').send({ name: 'Second shop', kind: 'store' }).expect(201)
      const depot = await alpha.post('/api/locations').send({ name: 'Depot', kind: 'warehouse' }).expect(201)
      expect(second.body.code).toBe('D2')
      expect(depot.body.code).toBe('S1')

      const repeat = await alpha.post('/api/locations').send({ name: 'second SHOP', kind: 'store' })
      expect(repeat.body.error.fields.name).toBeDefined()
    })

    it('does not archive a shop that still has active zones in it', async () => {
      const zone = await alpha.post('/api/locations').send({ name: 'Back room', kind: 'zone', parentId: shopId }).expect(201)
      await alpha.post(`/api/locations/${shopId}/archive`).expect(409)
      await alpha.post(`/api/locations/${zone.body.id}/archive`).expect(201)
    })

    it('finds people whatever script or keyboard layout the query was typed in', async () => {
      await alpha
        .post('/api/users')
        .send({ fullName: 'Anvar G‘ofurov', phone: '8 90 123-45-67', login: 'anvar', password: PASSWORD, roleIds: [cashierRoleId], allLocations: false, locationIds: [shopId] })
        .expect(201)

      for (const q of ['анвар', 'фтмфк', "gofurov anvar", '901234567']) {
        const found = await alpha.get('/api/users').query({ q })
        expect(found.body.items.map((item: { login: string }) => item.login)).toEqual(['anvar'])
      }
    })

    it('lets a person do only what their roles allow', async () => {
      const anvar = await signIn('anvar')
      await anvar.get('/api/users').expect(403)
      await anvar.post('/api/locations').send({ name: 'Mine', kind: 'store' }).expect(403)
      await anvar.get('/api/audit').expect(403)
      const options = await anvar.get('/api/locations/options').expect(200)
      expect(options.body.map((item: { id: string }) => item.id)).toEqual([shopId])
    })

    it('stops a manager from handing out rights they do not hold', async () => {
      await alpha
        .post('/api/users')
        .send({ fullName: 'Manager', login: 'manager', password: PASSWORD, roleIds: [managerRoleId], allLocations: true, locationIds: [] })
        .expect(201)
      const manager = await signIn('manager')

      const base = { fullName: 'Climber', login: 'climber', password: PASSWORD, allLocations: true, locationIds: [] }
      await manager.post('/api/users').send({ ...base, roleIds: [ownerRoleId] }).expect(403)
      await manager.post('/api/users').send({ ...base, roleIds: [cashierRoleId] }).expect(201)

      // Managers cannot manage roles at all, and cannot touch the owner.
      await manager.post('/api/roles').send({ name: 'Super', permissions: ['settings.manage'] }).expect(403)
      const owner = (await alpha.get('/api/users').query({ q: 'alpha' })).body.items[0]
      await manager.post(`/api/users/${owner.id}/password`).send({ password: 'hijacked-123' }).expect(403)
    })

    it('never leaves a business without an owner', async () => {
      const owner = (await alpha.get('/api/auth/me')).body.user
      await alpha.post(`/api/users/${owner.id}/block`).expect(409)
      const demote = await alpha
        .put(`/api/users/${owner.id}`)
        .send({ fullName: owner.fullName, login: owner.login, roleIds: [cashierRoleId], allLocations: true, locationIds: [] })
      expect(demote.status).toBe(409)
      expect(demote.body.error.code).toBe('LAST_OWNER')
    })

    it('ends a blocked person’s session at once', async () => {
      const anvar = await signIn('anvar')
      const row = (await alpha.get('/api/users').query({ q: 'anvar' })).body.items[0]
      await alpha.post(`/api/users/${row.id}/block`).expect(201)
      await anvar.get('/api/auth/me').expect(401)
      await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'anvar', password: PASSWORD }).expect(403)
    })

    it('protects the owner role and roles that are in use', async () => {
      await alpha.put(`/api/roles/${ownerRoleId}`).send({ name: 'Egasi', permissions: [] }).expect(403)
      await alpha.delete(`/api/roles/${managerRoleId}`).expect(409)
      await alpha.post('/api/roles').send({ name: 'Bad', permissions: ['*'] }).expect(400)
    })

    it('locks the session after too many wrong PINs', async () => {
      const agent = await signIn('alpha')
      // A PIN is four digits, no fewer and no more: the screen has a box for each.
      for (const pin of ['432', '43210', '432100', '43a1']) {
        await agent.post('/api/auth/pin').send({ password: PASSWORD, pin }).expect(400)
      }
      await agent.post('/api/auth/pin').send({ password: PASSWORD, pin: '4321' }).expect(204)
      await agent.post('/api/auth/unlock').send({ pin: '4321' }).expect(204)
      for (let attempt = 1; attempt <= 4; attempt++) {
        await agent.post('/api/auth/unlock').send({ pin: '0000' }).expect(400)
      }
      await agent.post('/api/auth/unlock').send({ pin: '0000' }).expect(401)
      await agent.get('/api/auth/me').expect(401)
    })

    it('lets a person take their PIN off again, for their password', async () => {
      const agent = await signIn('beta')
      await agent.post('/api/auth/pin').send({ password: PASSWORD, pin: '4321' }).expect(204)
      expect((await agent.get('/api/auth/me').expect(200)).body.user.hasPin).toBe(true)

      const refused = await agent.post('/api/auth/pin/remove').send({ password: 'not-the-password' }).expect(400)
      expect(refused.body.error.fields.password).toBe('Parol noto‘g‘ri')
      expect((await agent.get('/api/auth/me').expect(200)).body.user.hasPin).toBe(true)

      await agent.post('/api/auth/pin/remove').send({ password: PASSWORD }).expect(204)
      expect((await agent.get('/api/auth/me').expect(200)).body.user.hasPin).toBe(false)
      // Nothing left to unlock with, and nothing wrong with asking twice.
      expect((await agent.post('/api/auth/unlock').send({ pin: '4321' }).expect(400)).body.error.code).toBe('NO_PIN')
      await agent.post('/api/auth/pin/remove').send({ password: PASSWORD }).expect(204)
    })

    it('writes history that nobody can rewrite', async () => {
      const history = await alpha.get('/api/audit').query({ entity: 'location' }).expect(200)
      expect(history.body.items.some((item: { action: string }) => item.action === 'location.create')).toBe(true)

      await expect(
        dataSource.transaction(async (em) => {
          await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
          await em.query(`DELETE FROM audit_log`)
        }),
      ).rejects.toThrow(/append-only/)
    })
  })
})
