process.env.NODE_ENV = 'test'

import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { DataSource } from 'typeorm'

import { AppModule } from '../app.module'
import { OrgsService } from '../modules/orgs/orgs.service'
import { setupApp } from '../setup-app'

export const PASSWORD = 'correct-horse-9'

export type Agent = ReturnType<typeof request.agent>

export interface Harness {
  app: NestExpressApplication
  dataSource: DataSource
  /** The owner of the business "Alpha", signed in. */
  alpha: Agent
  /** The owner of the business "Beta", signed in. */
  beta: Agent
  signIn(login: string, password?: string): Promise<Agent>
  close(): Promise<void>
}

/**
 * Starts the API against the test database, emptied, with two businesses
 * that have finished their setup. Spec files run one after another
 * (`maxWorkers: 1`), so each starts from this same clean state.
 */
export async function startApp(): Promise<Harness> {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = module.createNestApplication<NestExpressApplication>()
  setupApp(app)
  await app.init()

  const dataSource = app.get(DataSource)
  expect(dataSource.options.database).toMatch(/test/)
  await dataSource.runMigrations()
  await dataSource.query('TRUNCATE organizations CASCADE')

  const signIn = async (login: string, password = PASSWORD) => {
    const agent = request.agent(app.getHttpServer())
    await agent.post('/api/auth/login').send({ login, password }).expect(204)
    return agent
  }

  const orgs = app.get(OrgsService)
  await orgs.create({ name: 'Alpha', owner: { fullName: 'Alpha Owner', login: 'alpha', password: PASSWORD } })
  await orgs.create({ name: 'Beta', owner: { fullName: 'Beta Owner', login: 'beta', password: PASSWORD } })

  const alpha = await signIn('alpha')
  const beta = await signIn('beta')

  const setup = (name: string, shop: string) => ({
    name,
    currencies: ['USD'],
    costCurrency: 'USD',
    locations: [{ name: shop, kind: 'store' }],
    modules: ['consignment'],
  })
  await alpha.post('/api/org/setup').send(setup('Alpha', 'Alpha shop')).expect(201)
  await beta.post('/api/org/setup').send(setup('Beta', 'Beta shop')).expect(201)

  return { app, dataSource, alpha, beta, signIn, close: () => app.close() }
}
