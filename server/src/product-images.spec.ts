import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import request from 'supertest'

import { type Agent, type Harness, PASSWORD, startApp } from './testing/harness'

interface Named {
  id: string
  name: string
}
interface AttributeRow extends Named {
  kind: string
  values: Named[]
}
interface Photo {
  id: string
  valueId: string | null
  small: string
  medium: string
  large: string
  blur: string
  width: number
  height: number
}

/** The least a JPEG can be and still say how large it is, padded to weigh what is asked. */
const jpeg = (width: number, height: number, bytes = 64) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03]),
    Buffer.alloc(Math.max(0, bytes - 14)),
    Buffer.from([0xff, 0xd9]),
  ])

const webp = (width: number, height: number) =>
  Buffer.concat([
    Buffer.from('RIFF\0\0\0\0WEBPVP8 \0\0\0\0\0\0\0', 'latin1'),
    Buffer.from([0x9d, 0x01, 0x2a, width & 0xff, width >> 8, height & 0xff, height >> 8]),
    Buffer.alloc(8),
  ])

const url = (data: Buffer, type = 'jpeg') => `data:image/${type};base64,${data.toString('base64')}`

/** A photograph as a screen sends it: three sizes of the same picture and a blur. */
const photo = (extra: Record<string, unknown> = {}) => ({
  small: url(jpeg(160, 107)),
  medium: url(jpeg(640, 427)),
  large: url(jpeg(1600, 1067, 4000)),
  blur: url(jpeg(16, 11)),
  ...extra,
})

/**
 * A model's photographs: kept as files on the server's disk, handed out by
 * an address anyone holding it may open, written down in the business's own
 * rows.
 */
describe('Product photographs', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let color: AttributeRow
  let size: AttributeRow
  let dressId: string
  let scarfId: string
  let alphaId: string

  const valueId = (attribute: AttributeRow, name: string) => attribute.values.find((value) => value.name === name)!.id
  const add = (productId: string, body: Record<string, unknown> = photo()) =>
    alpha.post(`/api/products/${productId}/images`).send(body)
  /** Asked for the way an `<img>` asks: with nothing but the address. */
  const fetched = (address: string) => request(harness.app.getHttpServer()).get(address)
  const onDisk = (image: Photo) => existsSync(join(tmpdir(), 'erp-test-uploads', alphaId, image.id, 's.jpg'))

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    alphaId = (await alpha.get('/api/auth/me').expect(200)).body.org.id

    const attributes = (await alpha.get('/api/attributes').expect(200)).body as AttributeRow[]
    color = attributes.find((attribute) => attribute.kind === 'color')!
    size = attributes.find((attribute) => attribute.name === 'O‘lcham (harfli)')!
    const create = async (body: Record<string, unknown>) =>
      (await alpha.post('/api/products').send(body).expect(201)).body.id as string
    dressId = await create({
      name: 'Ko‘ylak',
      axisIds: [color.id, size.id],
      variants: [
        { valueIds: [valueId(color, 'Qora'), valueId(size, 'M')] },
        { valueIds: [valueId(color, 'Oq'), valueId(size, 'M')] },
      ],
    })
    scarfId = await create({ name: 'Sharf', axisIds: [], variants: [{ valueIds: [] }] })

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

  it('keeps a photograph in three sizes and hands them out by address', async () => {
    expect((await alpha.get(`/api/products/${dressId}`).expect(200)).body.images).toEqual([])

    const sent = photo()
    const [image]: Photo[] = (await add(dressId, sent).expect(200)).body
    expect(image).toMatchObject({ valueId: null, blur: sent.blur, width: 1600, height: 1067 })
    expect(image.small).toBe(`/api/files/${alphaId}/${image.id}/s.jpg`)
    expect(image.large).toBe(`/api/files/${alphaId}/${image.id}/l.jpg`)
    expect((await alpha.get(`/api/products/${dressId}`).expect(200)).body.images).toEqual([image])

    // Nothing but the address is needed, and what comes back may be kept for good.
    const small = await fetched(image.small).expect(200)
    expect(small.headers['content-type']).toBe('image/jpeg')
    expect(small.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(Buffer.compare(small.body as Buffer, jpeg(160, 107))).toBe(0)
    expect(((await fetched(image.large).expect(200)).body as Buffer).length).toBe(jpeg(1600, 1067, 4000).length)

    // An address that is nobody's, or is not an address at all, opens nothing.
    await fetched(`/api/files/${alphaId}/${alphaId}/s.jpg`).expect(404)
    await fetched(image.small.replace('s.jpg', 's.webp')).expect(404)
    await fetched(`/api/files/${alphaId}/${image.id}/..%2F..%2Fpackage.json`).expect(404)
  })

  it('takes WebP as well, and nothing that only claims to be a picture', async () => {
    const pictures = { small: url(webp(160, 107), 'webp'), medium: url(webp(640, 427), 'webp') }
    const sent = photo({ ...pictures, large: url(webp(1600, 1067), 'webp') })
    const images: Photo[] = (await add(scarfId, sent).expect(200)).body
    expect(images[0].medium).toMatch(/\/m\.webp$/)
    expect((await fetched(images[0].medium).expect(200)).headers['content-type']).toBe('image/webp')

    const refused = async (body: Record<string, unknown>, field: string) => {
      const answer = await add(scarfId, body)
      expect(answer.status).toBe(400)
      expect(answer.body.error.fields[field]).toBeDefined()
    }
    // Says JPEG, is something else.
    await refused(photo({ large: url(Buffer.from('<svg onload="alert(1)"></svg>')) }), 'large')
    // Says WebP, is a JPEG.
    await refused(photo({ medium: url(jpeg(640, 427), 'webp') }), 'medium')
    // Larger than its size allows: the screen that sends photographs brings them down first.
    await refused(photo({ small: url(jpeg(1600, 1067)) }), 'small')
    await refused(photo({ large: url(jpeg(4000, 3000)) }), 'large')
    await refused(photo({ small: url(jpeg(160, 107, 90_000)) }), 'small')
    // The three sizes are one picture: of one kind.
    await refused(photo({ ...pictures }), 'large')
    await refused(photo({ blur: 'https://example.com/blur.jpg' }), 'blur')
    expect((await alpha.get(`/api/products/${scarfId}`).expect(200)).body.images).toHaveLength(1)
  })

  it('shows a colour by its own photograph, and the model by its first', async () => {
    const black = valueId(color, 'Qora')
    const images: Photo[] = (await add(dressId, photo({ valueId: black })).expect(200)).body
    expect(images.map((image) => image.valueId)).toEqual([null, black])
    // A colour the model does not come in is no colour of its photographs.
    const refused = await add(dressId, photo({ valueId: valueId(color, 'Qizil') }))
    expect(refused.status).toBe(400)
    expect(refused.body.error.fields.valueId).toBeDefined()

    const listed = (await alpha.get('/api/products').query({ q: 'ylak' }).expect(200)).body.items
    expect(listed).toEqual([
      expect.objectContaining({ id: dressId, image: { url: images[0].small, blur: images[0].blur } }),
    ])
    expect((await alpha.get('/api/products').query({ q: 'sharf' }).expect(200)).body.items[0].image).not.toBeNull()

    // The till shows the black dress by the black photograph and the white one by the model's.
    const shopId = (await alpha.get('/api/locations').expect(200)).body.items[0].id
    const registerId = (
      await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201)
    ).body.id
    const found: { label: string; image: { url: string } | null }[] = (
      await alpha.get('/api/pos/search').query({ registerId, q: 'ylak' }).expect(200)
    ).body
    const shown = Object.fromEntries(found.map((item) => [item.label.split(',')[0].trim(), item.image?.url]))
    expect(shown).toEqual({ Qora: images[1].small, Oq: images[0].small })

    // Said afterwards, too; and unsaid.
    const white = valueId(color, 'Oq')
    const moved: Photo[] = (
      await alpha.patch(`/api/products/${dressId}/images/${images[0].id}`).send({ valueId: white }).expect(200)
    ).body
    expect(moved.map((image) => image.valueId)).toEqual([white, black])
    await alpha.patch(`/api/products/${dressId}/images/${images[0].id}`).send({ valueId: null }).expect(200)
  })

  it('puts them in the order asked for, the first being the face', async () => {
    const before: Photo[] = (await alpha.get(`/api/products/${dressId}`).expect(200)).body.images
    const ids = before.map((image) => image.id).reverse()
    const after: Photo[] = (await alpha.put(`/api/products/${dressId}/images/order`).send({ ids }).expect(200)).body
    expect(after.map((image) => image.id)).toEqual(ids)
    expect((await alpha.get('/api/products').query({ q: 'ylak' }).expect(200)).body.items[0].image.url).toBe(
      after[0].small,
    )
    // Every photograph, once: an order made from an old list is refused.
    await alpha
      .put(`/api/products/${dressId}/images/order`)
      .send({ ids: [ids[0]] })
      .expect(409)
    await alpha
      .put(`/api/products/${dressId}/images/order`)
      .send({ ids: [ids[0], ids[0]] })
      .expect(409)
  })

  it('shows the face wherever models are listed: the stock, a receipt', async () => {
    const dress = (await alpha.get(`/api/products/${dressId}`).expect(200)).body
    const face = { url: dress.images[0].small, blur: dress.images[0].blur }

    const stock = (await alpha.get('/api/stock').query({ q: 'ylak', presence: 'all' }).expect(200)).body.items
    expect(stock).toEqual([expect.objectContaining({ productId: dressId, image: face })])
    // A model with no photograph has none to show.
    const bare = (await alpha.post('/api/products').send({ name: 'Kamar', axisIds: [], variants: [{ valueIds: [] }] }))
      .body
    expect(
      (await alpha.get('/api/stock').query({ q: 'kamar', presence: 'all' }).expect(200)).body.items[0].image,
    ).toBeNull()

    const shopId = (await alpha.get('/api/locations').expect(200)).body.items[0].id
    const receipt = (
      await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [
            { variantId: dress.variants[0].id, qty: 1, price: 100_000_00 },
            { variantId: bare.variants[0].id, qty: 1, price: 50_000_00 },
          ],
        })
        .expect(201)
    ).body
    const shown = Object.fromEntries(
      (receipt.products as { id: string; image: unknown }[]).map((product) => [product.id, product.image]),
    )
    expect(shown).toEqual({ [dressId]: face, [bare.id]: null })
  })

  it('takes a photograph away, file and all', async () => {
    const [first, second]: Photo[] = (await alpha.get(`/api/products/${dressId}`).expect(200)).body.images
    expect(onDisk(first)).toBe(true)
    const left: Photo[] = (await alpha.delete(`/api/products/${dressId}/images/${first.id}`).expect(200)).body
    expect(left.map((image) => image.id)).toEqual([second.id])
    expect(onDisk(first)).toBe(false)
    await fetched(first.small).expect(404)
    await alpha.delete(`/api/products/${dressId}/images/${first.id}`).expect(404)

    const history = (await alpha.get('/api/audit').query({ entity: 'product' }).expect(200)).body.items
    expect(history.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining(['product.image.add', 'product.image.remove']),
    )
  })

  it('stops at ten to a model', async () => {
    const before = (await alpha.get(`/api/products/${scarfId}`).expect(200)).body.images.length
    for (let count = before; count < 10; count += 1) {
      await add(scarfId).expect(200)
    }
    const refused = await add(scarfId)
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('TOO_MANY_IMAGES')
  })

  it('throws the files away with a model that is deleted', async () => {
    const images: Photo[] = (await alpha.get(`/api/products/${scarfId}`).expect(200)).body.images
    expect(existsSync(join(tmpdir(), 'erp-test-uploads', alphaId, images[0].id))).toBe(true)
    await alpha.delete(`/api/products/${scarfId}`).expect(204)
    for (const image of images) {
      expect(existsSync(join(tmpdir(), 'erp-test-uploads', alphaId, image.id))).toBe(false)
    }
  })

  it('is for those who keep the catalogue, in their own business', async () => {
    await cashier.post(`/api/products/${dressId}/images`).send(photo()).expect(403)
    const [image]: Photo[] = (await alpha.get(`/api/products/${dressId}`).expect(200)).body.images
    await cashier.delete(`/api/products/${dressId}/images/${image.id}`).expect(403)

    // Another business cannot add to this model, nor touch its photographs.
    await beta.post(`/api/products/${dressId}/images`).send(photo()).expect(404)
    await beta.delete(`/api/products/${dressId}/images/${image.id}`).expect(404)
    await beta
      .put(`/api/products/${dressId}/images/order`)
      .send({ ids: [image.id] })
      .expect(404)
    expect((await alpha.get(`/api/products/${dressId}`).expect(200)).body.images).toHaveLength(1)
  })
})
