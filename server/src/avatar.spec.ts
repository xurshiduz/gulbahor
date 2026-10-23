import request from 'supertest'

import { type Agent, type Harness, startApp } from './testing/harness'

const webp = (width: number, height: number) =>
  Buffer.concat([
    Buffer.from('RIFF\0\0\0\0WEBPVP8 \0\0\0\0\0\0\0', 'latin1'),
    Buffer.from([0x9d, 0x01, 0x2a, width & 0xff, width >> 8, height & 0xff, height >> 8]),
    Buffer.alloc(8),
  ])
const url = (data: Buffer, type = 'webp') => `data:image/${type};base64,${data.toString('base64')}`

/** A person's own picture: put on, seen by everyone listing staff, changed for a new address, taken off. */
describe('Profile picture', () => {
  let harness: Harness
  let alpha: Agent

  const fetched = (address: string) => request(harness.app.getHttpServer()).get(address)

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('is kept, shown, replaced under a new address and taken off', async () => {
    expect((await alpha.get('/api/auth/me').expect(200)).body.user.avatar).toBeNull()

    const first = (await alpha.put('/api/auth/avatar').send({ picture: url(webp(256, 256)) }).expect(200)).body.avatar
    expect(first).toMatch(/^\/api\/files\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/s\.webp$/)
    expect((await alpha.get('/api/auth/me').expect(200)).body.user.avatar).toBe(first)
    expect((await fetched(first).expect(200)).headers['content-type']).toBe('image/webp')
    const me = (await alpha.get('/api/auth/me').expect(200)).body.user.id
    const listed = (await alpha.get('/api/users').expect(200)).body.items.find((user: { id: string }) => user.id === me)
    expect(listed.avatar).toBe(first)

    const second = (await alpha.put('/api/auth/avatar').send({ picture: url(webp(256, 256)) }).expect(200)).body.avatar
    expect(second).not.toBe(first)
    await fetched(first).expect(404)

    expect((await alpha.put('/api/auth/avatar').send({ picture: null }).expect(200)).body.avatar).toBeNull()
    await fetched(second).expect(404)
  })

  it('takes nothing that only claims to be a picture, nor one too large', async () => {
    const bad = await alpha.put('/api/auth/avatar').send({ picture: url(Buffer.from('not a picture')) }).expect(400)
    expect(bad.body.error.fields.picture).toBeTruthy()
    await alpha.put('/api/auth/avatar').send({ picture: url(webp(2000, 2000)) }).expect(400)
  })
})
