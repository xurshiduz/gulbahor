import { formatMoney, isValidEan13 } from '@gulbahor/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

interface Named {
  id: string
  name: string
}

interface AttributeRow extends Named {
  kind: string
  values: (Named & { hex: string | null })[]
}

interface VariantRow {
  id: string
  valueIds: string[]
  sku: string
  barcodes: string[]
  isActive: boolean
}

/**
 * The catalogue: models, their variants, barcodes and prices, and the lists
 * they are built from. As everywhere, one business never sees another's.
 */
describe('Catalogue', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent

  let color: AttributeRow
  let size: AttributeRow
  let priceTypes: (Named & { kind: string })[]
  let shirtsId: string

  const valueId = (attribute: AttributeRow, name: string) => attribute.values.find((value) => value.name === name)!.id
  const retail = () => priceTypes.find((type) => type.kind === 'retail')!.id
  const wholesale = () => priceTypes.find((type) => type.kind === 'wholesale')!.id

  /** A model in colour × letter size with one variant per listed pair. */
  const model = (name: string, pairs: [string, string][], extra: Record<string, unknown> = {}) => ({
    name,
    categoryId: shirtsId,
    axisIds: [color.id, size.id],
    variants: pairs.map(([colorName, sizeName]) => ({
      valueIds: [valueId(color, colorName), valueId(size, sizeName)],
    })),
    ...extra,
  })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)

    const attributes = (await alpha.get('/api/attributes').expect(200)).body as AttributeRow[]
    color = attributes.find((attribute) => attribute.kind === 'color')!
    size = attributes.find((attribute) => attribute.name === 'O‘lcham (harfli)')!
    priceTypes = (await alpha.get('/api/price-types').expect(200)).body
    const categories = (await alpha.get('/api/categories').expect(200)).body as (Named & { parentId: string | null })[]
    shirtsId = categories.find((category) => category.name === 'Futbolkalar')!.id
  })

  afterAll(async () => {
    await harness.close()
  })

  describe('what a new business starts with', () => {
    it('has price types, colours, size scales and categories', async () => {
      expect(priceTypes.map((type) => type.kind)).toEqual(['retail', 'wholesale', 'min'])
      expect(color.values.find((value) => value.name === 'Qora')?.hex).toBe('#000000')
      expect(size.values.map((value) => value.name).slice(0, 4)).toEqual(['XXS', 'XS', 'S', 'M'])
      // Running the starter again adds nothing.
      expect((await alpha.post('/api/catalog/starter').expect(201)).body).toEqual({ applied: false })
    })

    it('keeps exactly one retail price type', async () => {
      await alpha.post('/api/price-types').send({ name: 'Chakana 2', kind: 'retail', currency: 'UZS' }).expect(400)
      await alpha.post(`/api/price-types/${retail()}/archive`).expect(409)
      await alpha.delete(`/api/price-types/${retail()}`).expect(409)
      await alpha
        .put(`/api/price-types/${retail()}`)
        .send({ name: 'Chakana', kind: 'other', currency: 'UZS' })
        .expect(400)
      const vip = await alpha
        .post('/api/price-types')
        .send({ name: 'Doimiy hamkor', kind: 'other', currency: 'USD' })
        .expect(201)
      await alpha.delete(`/api/price-types/${vip.body.id}`).expect(204)
    })
  })

  describe('models and variants', () => {
    let poloId: string

    it('creates a model with an article, variant articles and in-store barcodes', async () => {
      const created = await alpha
        .post('/api/products')
        .send(
          model(
            'Futbolka Polo',
            [
              ['Qora', 'S'],
              ['Qora', 'M'],
              ['Oq', 'S'],
            ],
            { prices: [{ priceTypeId: retail(), amount: 120_000_00, currency: 'UZS' }] },
          ),
        )
        .expect(201)
      poloId = created.body.id
      const variants = created.body.variants as VariantRow[]

      expect(created.body.sku).toBe('1001')
      expect(variants.map((variant) => variant.sku).sort()).toEqual(['1001-01', '1001-02', '1001-03'])
      for (const variant of variants) {
        expect(variant.barcodes).toHaveLength(1)
        expect(isValidEan13(variant.barcodes[0])).toBe(true)
      }
      expect(new Set(variants.map((variant) => variant.barcodes[0])).size).toBe(3)
      expect(created.body.prices).toEqual([{ priceTypeId: retail(), amount: 120_000_00, currency: 'UZS' }])

      const second = await alpha
        .post('/api/products')
        .send(model('Futbolka Basic', [['Qora', 'M']]))
        .expect(201)
      expect(second.body.sku).toBe('1002')
    })

    it('lists a model with its colours, sizes and retail price', async () => {
      const list = await alpha.get('/api/products').query({ q: 'polo' }).expect(200)
      expect(list.body.total).toBe(1)
      const [row] = list.body.items
      expect(row.variantCount).toBe(3)
      expect(row.categoryName).toBe('Futbolkalar')
      expect(row.retailPrice).toEqual({ amount: 120_000_00, currency: 'UZS' })
      expect(
        row.axes.map((axis: { kind: string; values: Named[] }) => [axis.kind, axis.values.map((value) => value.name)]),
      ).toEqual([
        ['color', ['Oq', 'Qora']],
        ['size', ['S', 'M']],
      ])
    })

    it('finds a model by colour, barcode or article, in any script', async () => {
      const polo = (await alpha.get(`/api/products/${poloId}`)).body
      const barcode = polo.variants[0].barcodes[0]
      for (const q of ['футболка поло', 'polo qora', barcode, '1001-02', 'зщдщ']) {
        const found = await alpha.get('/api/products').query({ q })
        expect(found.body.items.map((item: Named) => item.name)).toContain('Futbolka Polo')
      }
      expect((await alpha.get('/api/products').query({ q: 'polo yashil' })).body.total).toBe(0)

      const scanned = await alpha.get('/api/products/lookup').query({ code: barcode }).expect(200)
      expect(scanned.body.productId).toBe(poloId)
      expect(scanned.body.variantId).toBe(polo.variants[0].id)
      await alpha.get('/api/products/lookup').query({ code: '0000000000000' }).expect(404)
    })

    it('filters by a category and everything under it', async () => {
      const categories = (await alpha.get('/api/categories')).body as (Named & { parentId: string | null })[]
      const parent = categories.find((category) => category.id === shirtsId)!.parentId
      expect((await alpha.get('/api/products').query({ categoryId: parent })).body.total).toBe(2)
      const other = categories.find((category) => category.name === 'Poyabzal')!
      expect((await alpha.get('/api/products').query({ categoryId: other.id })).body.total).toBe(0)
    })

    it('adds, changes and removes variants in one save, keeping what was not touched', async () => {
      const before = (await alpha.get(`/api/products/${poloId}`)).body
      const find = (colorName: string, sizeName: string) =>
        (before.variants as VariantRow[]).find(
          (variant) => variant.valueIds.join() === [valueId(color, colorName), valueId(size, sizeName)].join(),
        )!
      const blackS = find('Qora', 'S')
      const blackM = find('Qora', 'M')
      const whiteS = find('Oq', 'S')

      const saved = await alpha
        .put(`/api/products/${poloId}`)
        .send({
          ...model('Futbolka Polo', []),
          sku: 'POLO-22',
          variants: [
            { id: blackS.id, valueIds: blackS.valueIds, barcodes: [...blackS.barcodes, '4006381333931'] },
            { id: blackM.id, valueIds: blackM.valueIds, barcodes: blackM.barcodes, isActive: false },
            {
              valueIds: [valueId(color, 'Oq'), valueId(size, 'L')],
              prices: [{ priceTypeId: retail(), amount: 135_000_00, currency: 'UZS' }],
            },
          ],
          prices: [
            { priceTypeId: retail(), amount: 125_000_00, currency: 'UZS' },
            { priceTypeId: wholesale(), amount: 90_000_00, currency: 'UZS' },
          ],
        })
        .expect(200)

      const variants = saved.body.variants as (VariantRow & { prices: unknown[] })[]
      expect(saved.body.sku).toBe('POLO-22')
      expect(variants).toHaveLength(3)
      const byId = new Map(variants.map((variant) => [variant.id, variant]))
      // Automatic articles follow the model's new article; the removed variant is gone.
      expect(byId.get(blackS.id)?.sku).toBe('POLO-22-01')
      expect(byId.get(blackS.id)?.barcodes).toEqual([...blackS.barcodes, '4006381333931'])
      expect(byId.get(blackM.id)?.isActive).toBe(false)
      expect(byId.has(whiteS.id)).toBe(false)
      const added = variants.find((variant) => ![blackS.id, blackM.id].includes(variant.id))!
      expect(added.sku).toBe('POLO-22-04')
      expect(added.prices).toEqual([{ priceTypeId: retail(), amount: 135_000_00, currency: 'UZS' }])
      expect(saved.body.prices).toHaveLength(2)

      const history = await alpha.get('/api/audit').query({ entity: 'product' })
      const update = history.body.items.find((item: { action: string }) => item.action === 'product.update')
      expect(update.changes.sku).toEqual(['1001', 'POLO-22'])
      expect(update.changes['Narx: Chakana']).toEqual([formatMoney(120_000_00, 'UZS'), formatMoney(125_000_00, 'UZS')])
      expect(update.changes.barcodes).toEqual([null, '4006381333931'])
      expect(update.changes.variantsRemoved).toEqual(['Oq, S', null])
      expect(update.changes.variantsAdded).toEqual([null, 'Oq, L'])
      expect(update.changes.variantsArchived).toEqual([null, 'Qora, M'])
    })

    it('refuses an article or a barcode that another model already has, and says whose it is', async () => {
      const article = await alpha.post('/api/products').send(model('Copy', [['Qora', 'S']], { sku: 'polo-22' }))
      expect(article.status).toBe(400)
      expect(article.body.error.fields.sku).toContain('Futbolka Polo')

      const barcode = await alpha.post('/api/products').send({
        ...model('Copy', []),
        variants: [{ valueIds: [valueId(color, 'Qora'), valueId(size, 'S')], barcodes: ['4006381333931'] }],
      })
      expect(barcode.status).toBe(400)
      expect(barcode.body.error.fields['variants.0.barcodes.0']).toBe('Bu shtrix-kod «Futbolka Polo, Qora, S» da bor')

      const variantArticle = await alpha.post('/api/products').send({
        ...model('Copy', []),
        variants: [{ valueIds: [valueId(color, 'Qora'), valueId(size, 'S')], sku: 'POLO-22-01' }],
      })
      expect(variantArticle.body.error.fields['variants.0.sku']).toBeDefined()
    })

    it('refuses variants that do not fit the model', async () => {
      const swapped = await alpha.post('/api/products').send({
        ...model('Wrong', []),
        variants: [{ valueIds: [valueId(size, 'S'), valueId(color, 'Qora')] }],
      })
      expect(swapped.status).toBe(400)
      expect(swapped.body.error.fields['variants.0.valueIds']).toBeDefined()

      await alpha
        .post('/api/products')
        .send({ name: 'Sharf', axisIds: [], variants: [{ valueIds: [] }, { valueIds: [] }] })
        .expect(400)
      const scarf = await alpha
        .post('/api/products')
        .send({ name: 'Sharf', axisIds: [], variants: [{ valueIds: [] }] })
        .expect(201)
      expect(scarf.body.variants).toHaveLength(1)
    })

    it('finds models again after a colour or a brand is renamed', async () => {
      const brand = await alpha.post('/api/brands').send({ name: 'Zara' }).expect(201)
      const polo = (await alpha.get(`/api/products/${poloId}`)).body
      await alpha
        .put(`/api/products/${poloId}`)
        .send({ ...polo, brandId: brand.body.id })
        .expect(200)
      expect((await alpha.get('/api/products').query({ q: 'zara polo' })).body.total).toBe(1)

      await alpha.put(`/api/brands/${brand.body.id}`).send({ name: 'Mango' }).expect(200)
      expect((await alpha.get('/api/products').query({ q: 'zara' })).body.total).toBe(0)
      expect((await alpha.get('/api/products').query({ q: 'mango polo' })).body.total).toBe(1)

      await alpha
        .put(`/api/attributes/values/${valueId(color, 'Qora')}`)
        .send({ name: 'Antratsit', hex: '#222222' })
        .expect(200)
      expect((await alpha.get('/api/products').query({ q: 'polo antratsit' })).body.total).toBe(1)
      await alpha
        .put(`/api/attributes/values/${valueId(color, 'Qora')}`)
        .send({ name: 'Qora', hex: '#000000' })
        .expect(200)
    })

    it('does not delete what models are built from', async () => {
      await alpha.delete(`/api/attributes/values/${valueId(color, 'Qora')}`).expect(409)
      await alpha.delete(`/api/attributes/${color.id}`).expect(409)
      await alpha.delete(`/api/categories/${shirtsId}`).expect(409)
      // An unused value can go.
      await alpha.delete(`/api/attributes/values/${valueId(color, 'Bej')}`).expect(200)
    })

    it('adds several values at once and skips the ones already there', async () => {
      const added = await alpha
        .post(`/api/attributes/${size.id}/values`)
        .send({ values: [{ name: 'xl' }, { name: '6XL' }, { name: '7XL' }] })
        .expect(201)
      const names = (added.body.values as Named[]).map((value) => value.name)
      expect(names.filter((name) => name.toLowerCase() === 'xl')).toHaveLength(1)
      expect(names.slice(-2)).toEqual(['6XL', '7XL'])

      const ids = (added.body.values as Named[]).map((value) => value.id)
      const reordered = await alpha
        .put(`/api/attributes/${size.id}/values/order`)
        .send({ ids: [ids[ids.length - 1]] })
        .expect(200)
      expect(reordered.body.values[0].name).toBe('7XL')
    })

    it('makes one colour of two spellings, and refuses when a model has both', async () => {
      const added = (
        await alpha
          .post(`/api/attributes/${color.id}/values`)
          .send({ values: [{ name: 'Chorniy' }, { name: 'Siyah' }] })
          .expect(201)
      ).body as AttributeRow
      const black = valueId(added, 'Qora')
      const dress = (
        await alpha
          .post('/api/products')
          .send({
            name: 'Koylak uzun',
            categoryId: shirtsId,
            axisIds: [color.id, size.id],
            variants: [
              { valueIds: [valueId(added, 'Chorniy'), valueId(size, 'S')] },
              { valueIds: [valueId(added, 'Siyah'), valueId(size, 'S')] },
              { valueIds: [valueId(added, 'Chorniy'), valueId(size, 'M')] },
            ],
          })
          .expect(201)
      ).body

      // Both spellings on one size of one model: merged, it would have that size twice.
      const both = await alpha
        .post(`/api/attributes/values/${valueId(added, 'Siyah')}/merge`)
        .send({ intoId: valueId(added, 'Chorniy') })
        .expect(409)
      expect(both.body.error.code).toBe('VALUES_OVERLAP')
      expect(both.body.error.message).toContain('Koylak uzun')
      // Nor is a value merged into itself, or into a size.
      await alpha.post(`/api/attributes/values/${black}/merge`).send({ intoId: black }).expect(400)
      await alpha
        .post(`/api/attributes/values/${black}/merge`)
        .send({ intoId: valueId(size, 'S') })
        .expect(400)

      const kept = dress.variants as VariantRow[]
      await alpha
        .put(`/api/products/${dress.id}`)
        .send({ ...dress, variants: kept.filter((variant) => variant.valueIds[0] !== valueId(added, 'Siyah')) })
        .expect(200)
      const merged = (
        await alpha
          .post(`/api/attributes/values/${valueId(added, 'Chorniy')}/merge`)
          .send({ intoId: black })
          .expect(200)
      ).body as AttributeRow
      expect(merged.values.some((value) => value.name === 'Chorniy')).toBe(false)

      // The model's variants are the same ones, now of the colour that stayed, and found by its name.
      const after = (await alpha.get(`/api/products/${dress.id}`).expect(200)).body.variants as VariantRow[]
      expect(after.map((variant) => variant.id).sort()).toEqual(
        kept
          .filter((variant) => variant.valueIds[0] !== valueId(added, 'Siyah'))
          .map((variant) => variant.id)
          .sort(),
      )
      expect(after.every((variant) => variant.valueIds[0] === black)).toBe(true)
      expect((await alpha.get('/api/products').query({ q: 'koylak qora' })).body.total).toBe(1)
      expect((await alpha.get('/api/products').query({ q: 'koylak chorniy' })).body.total).toBe(0)

      // An unused spelling goes the same way; another business cannot reach in.
      await beta
        .post(`/api/attributes/values/${valueId(added, 'Siyah')}/merge`)
        .send({ intoId: black })
        .expect(404)
      await alpha
        .post(`/api/attributes/values/${valueId(added, 'Siyah')}/merge`)
        .send({ intoId: black })
        .expect(200)
    })
  })

  describe('rights', () => {
    it('lets a cashier look but not change, and keeps prices from those without the right', async () => {
      const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
      const role = (key: string) => roles.find((item) => item.templateKey === key)!.id
      const base = { password: PASSWORD, allLocations: true, locationIds: [] }
      await alpha
        .post('/api/users')
        .send({ ...base, fullName: 'Kassir', login: 'kassir', roleIds: [role('cashier')] })
        .expect(201)
      await alpha
        .post('/api/users')
        .send({ ...base, fullName: 'Sklad', login: 'sklad', roleIds: [role('warehouse')] })
        .expect(201)

      const cashier = await harness.signIn('kassir')
      await cashier.get('/api/products').expect(200)
      await cashier
        .post('/api/products')
        .send(model('Mine', [['Qora', 'S']]))
        .expect(403)
      await cashier.post('/api/brands').send({ name: 'Mine' }).expect(403)

      // The warehouse keeper creates models but has no say over prices: the ones sent are ignored.
      const keeper = await harness.signIn('sklad')
      const created = await keeper
        .post('/api/products')
        .send(model('Shim', [['Qora', 'M']], { prices: [{ priceTypeId: retail(), amount: 1_00, currency: 'UZS' }] }))
        .expect(201)
      expect(created.body.prices).toEqual([])
      await keeper.post('/api/price-types').send({ name: 'Mine', kind: 'other', currency: 'UZS' }).expect(403)
    })
  })

  describe('isolation between businesses', () => {
    it('shows each business only its own catalogue', async () => {
      expect((await beta.get('/api/products')).body.total).toBe(0)
      expect((await beta.get('/api/brands')).body).toEqual([])
      const product = (await alpha.get('/api/products')).body.items[0]
      await beta.get(`/api/products/${product.id}`).expect(404)
      await beta.post(`/api/products/${product.id}/archive`).expect(404)
      await beta.delete(`/api/products/${product.id}`).expect(404)
    })

    it('cannot build a model from the lists of another business', async () => {
      const betaAttributes = (await beta.get('/api/attributes')).body as AttributeRow[]
      const betaColor = betaAttributes.find((attribute) => attribute.kind === 'color')!

      // Alpha's ids mean nothing inside Beta.
      await beta
        .post('/api/products')
        .send(model('Stolen', [['Qora', 'S']]))
        .expect(400)
      await beta
        .post('/api/products')
        .send({ name: 'Mixed', axisIds: [betaColor.id], variants: [{ valueIds: [valueId(color, 'Qora')] }] })
        .expect(400)
      await beta
        .put(`/api/attributes/values/${valueId(color, 'Qora')}`)
        .send({ name: 'Hacked' })
        .expect(404)
    })

    it('gives each business its own numbering, and lets barcodes and articles repeat across them', async () => {
      const betaAttributes = (await beta.get('/api/attributes')).body as AttributeRow[]
      const betaColor = betaAttributes.find((attribute) => attribute.kind === 'color')!
      const created = await beta
        .post('/api/products')
        .send({
          name: 'Beta polo',
          sku: 'POLO-22',
          axisIds: [betaColor.id],
          variants: [{ valueIds: [betaColor.values[0].id], barcodes: ['4006381333931'] }],
        })
        .expect(201)
      expect(created.body.sku).toBe('POLO-22')
      const numbered = await beta
        .post('/api/products')
        .send({ name: 'Beta basic', axisIds: [], variants: [{ valueIds: [] }] })
        .expect(201)
      expect(numbered.body.sku).toBe('1001')
    })
  })
})
