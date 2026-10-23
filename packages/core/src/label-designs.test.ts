import { describe, expect, it } from 'vitest'

import {
  buildDesignZpl,
  labelDesignSchema,
  labelElementSchema,
  layoutDesign,
  SAMPLE_LABEL_VALUES,
  starterDesign,
  type LabelDesign,
} from './label-designs'

const ID = '7c9e8e8b-5aa6-4e28-a281-3879ca503d01'

const design = (elements: Partial<LabelDesign['elements'][number]>[], more: Partial<LabelDesign> = {}): LabelDesign =>
  labelDesignSchema.parse({
    id: ID,
    name: 'Sinov',
    width: 58,
    height: 40,
    elements: elements.map((element, index) =>
      labelElementSchema.parse({ id: `e${index}`, x: 0, y: 0, w: 20, h: 5, ...element }),
    ),
    ...more,
  })

describe('a label design', () => {
  it('puts each element where it was placed, in the dots of the head', () => {
    const layout = layoutDesign(
      design([{ field: 'name', x: 2, y: 3, w: 30, h: 8, size: 10, lines: 2 }]),
      SAMPLE_LABEL_VALUES,
    )
    expect(layout).toMatchObject({ width: 464, height: 320 })
    expect(layout.items[0]).toMatchObject({
      kind: 'text',
      x: 16,
      y: 24,
      width: 240,
      font: 28,
      lines: 2,
      text: 'kardigan kalta',
    })
    // A head of 300 dpi: the same millimetres, more dots.
    expect(layoutDesign(design([{ field: 'name', x: 2, y: 3 }]), SAMPLE_LABEL_VALUES, 300).items[0]).toMatchObject({
      x: 24,
      y: 36,
    })
  })

  it('writes the words before a value, and leaves out a fact the goods do not have', () => {
    const layout = layoutDesign(
      design([
        { field: 'brand', prefix: 'Бренд:' },
        { field: 'material', prefix: 'Material:' },
        { field: 'text', text: 'Rahmat!' },
      ]),
      { brand: 'max mara' },
    )
    expect(layout.items.map((item) => (item.kind === 'text' ? item.text : item.kind))).toEqual([
      'Бренд: max mara',
      'Rahmat!',
    ])
  })

  it('draws a barcode as wide as its box allows, EAN-13 where the code is one', () => {
    const layout = layoutDesign(design([{ field: 'barcode', x: 28, y: 23, w: 28, h: 15 }]), SAMPLE_LABEL_VALUES)
    expect(layout.items[0]).toMatchObject({ kind: 'bars', ean: true, module: 2, code: '200000045793' })
    const zpl = buildDesignZpl(
      design([{ field: 'barcode', w: 50, h: 15 }], { barcode: 'code128' }),
      SAMPLE_LABEL_VALUES,
    )
    expect(zpl).toContain('^BCN,')
    // Too long for its box, a code is left out rather than cut.
    expect(layoutDesign(design([{ field: 'barcode', w: 5, h: 10 }]), SAMPLE_LABEL_VALUES).items).toEqual([])
  })

  it('tells the printer bold, the line under, the chip and the logo', () => {
    const zpl = buildDesignZpl(
      design(
        [
          { field: 'price', bold: true, underline: true },
          { field: 'logo', x: 1, y: 1 },
        ],
        {
          logo: { width: 16, height: 2, hex: 'FFFF0000', preview: 'data:image/png;base64,AA' },
        },
      ),
      SAMPLE_LABEL_VALUES,
      { epc: '30340000000000000000000A' },
    )
    expect(zpl.match(/\^FD125 000\^FS/g)).toHaveLength(2)
    expect(zpl).toContain('^GB160,2,2^FS')
    expect(zpl).toContain('^RFW,H^FD30340000000000000000000A^FS')
    expect(zpl).toContain('^FO8,8^GFA,4,4,2,FFFF0000^FS')
    expect(zpl).toContain('^PQ1')
  })

  it('starts from the shop’s own label', () => {
    const starter = starterDesign(ID, 'Gulbahor 58×40')
    expect(labelDesignSchema.safeParse(starter).success).toBe(true)
    const fields = layoutDesign(starter, SAMPLE_LABEL_VALUES).items.map((item) => item.kind)
    expect(fields.filter((kind) => kind === 'text')).toHaveLength(8)
    expect(fields).toContain('bars')
  })
})
