import { describe, expect, it } from 'vitest'

import {
  buildLabelZpl,
  DEFAULT_LABEL_TEMPLATE,
  labelTemplateSchema,
  labelTextWidth,
  layoutLabel,
  type LabelTemplate,
  epcOfSerial,
  isLocalHost,
  isOwnEpc,
  labelPrintSchema,
  normalizeEpc,
  printerInputSchema,
  type LabelData,
} from './labels'

const ID = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

describe('EPC', () => {
  it('makes a 96-bit code out of a serial number', () => {
    expect(epcOfSerial(1)).toBe('47554C000000000000000001')
    expect(epcOfSerial(255)).toBe('47554C0000000000000000FF')
    expect(epcOfSerial(2n ** 72n - 1n)).toBe('47554CFFFFFFFFFFFFFFFFFF')
    expect(() => epcOfSerial(2n ** 72n)).toThrow(RangeError)
    expect(() => epcOfSerial(0)).toThrow(RangeError)
  })

  it('reads a code however the reader spells it', () => {
    const epc = '47554C00000000000000002A'
    expect(normalizeEpc(epc.toLowerCase())).toBe(epc)
    expect(normalizeEpc('4755 4C00 0000 0000 0000 002A')).toBe(epc)
    expect(normalizeEpc('47-55-4C-00-00-00-00-00-00-00-00-2A')).toBe(epc)
    // With the PC word in front, and with a CRC behind as well.
    expect(normalizeEpc(`3000${epc}`)).toBe(epc)
    expect(normalizeEpc(`3000${epc}A1B2`)).toBe(epc)
    expect(isOwnEpc(epc)).toBe(true)
    expect(isOwnEpc('303400000000000000000001')).toBe(false)
  })

  it('does not take a barcode or an article for a tag', () => {
    expect(normalizeEpc('2000000000015')).toBeNull()
    expect(normalizeEpc('1001-01')).toBeNull()
    expect(normalizeEpc('')).toBeNull()
    expect(normalizeEpc('GGGGGGGGGGGGGGGGGGGGGGGG')).toBeNull()
  })
})

describe('buildLabelZpl', () => {
  const label: LabelData = {
    name: 'Futbolka Polo',
    details: 'Qora · M',
    sku: '1001-06',
    barcode: '2000000000015',
    price: "95 000 so'm",
    epc: '47554C00000000000000002A',
  }

  it('prints the label and writes the chip in one block', () => {
    const zpl = buildLabelZpl(label, { size: '50x30', dpi: 203 })
    expect(zpl.startsWith('^XA\n^CI28\n^PW400\n^LL240')).toBe(true)
    expect(zpl.endsWith('^PQ1\n^XZ')).toBe(true)
    expect(zpl).toContain('^RFW,H^FD47554C00000000000000002A^FS')
    expect(zpl).toContain('^FDFutbolka Polo^FS')
    expect(zpl).toContain('^FDQora · M^FS')
    // EAN-13: twelve digits go in, the printer adds the check digit.
    expect(zpl).toContain('^BEN,44,Y,N^FD200000000001^FS')
    // The no-break space of a formatted price becomes an ordinary one.
    expect(zpl).toContain("^FD95 000 so'm^FS")
    expect(zpl).toContain('^FD1001-06  #00002A^FS')
  })

  it('leaves the chip alone on a plain label and repeats it instead', () => {
    const zpl = buildLabelZpl({ ...label, epc: null, copies: 12 }, { size: '50x30', dpi: 203 })
    expect(zpl).not.toContain('^RF')
    expect(zpl).not.toContain('^RS')
    expect(zpl).toContain('^PQ12')
    expect(zpl).toContain('^FD1001-06^FS')
  })

  it('scales to a 300 dpi head', () => {
    const zpl = buildLabelZpl(label, { size: '60x40', dpi: 300 })
    expect(zpl).toContain('^PW720')
    expect(zpl).toContain('^LL480')
    expect(zpl).toContain('^BY3^BEN,120,Y,N')
  })

  it('falls back to Code 128, with thinner bars when the code is long, and to none when it cannot fit', () => {
    const short = buildLabelZpl({ ...label, barcode: 'AB-1234' }, { size: '50x30', dpi: 203 })
    expect(short).toContain('^BY2^BCN,44,Y,N,N^FDAB-1234^FS')
    const long = buildLabelZpl({ ...label, barcode: 'ABCDEFGHIJ-123456789' }, { size: '40x30', dpi: 203 })
    expect(long).toContain('^BY1^BCN,44,Y,N,N^FDABCDEFGHIJ-123456789^FS')
    const tooLong = buildLabelZpl({ ...label, barcode: 'X'.repeat(40) }, { size: '40x30', dpi: 203 })
    expect(tooLong).not.toContain('^BC')
    // With no barcode the article stands in for it.
    expect(buildLabelZpl({ ...label, barcode: null }, { size: '50x30', dpi: 203 })).toContain('^FD1001-06^FS')
  })

  it('keeps command characters out of the data', () => {
    const zpl = buildLabelZpl({ ...label, name: 'Polo ^XZ ~JR \\&' }, { size: '50x30', dpi: 203 })
    expect(zpl).toContain('^FDPolo XZ JR &^FS')
    expect(zpl.match(/\^XZ/g)).toHaveLength(1)
  })
})

describe('a label laid out by the template', () => {
  const label: LabelData = {
    name: 'Futbolka Polo',
    details: 'Qora · M',
    sku: '1001-06',
    barcode: '2000000000015',
    price: "95 000 so'm",
    epc: '47554C00000000000000002A',
  }
  const format = { size: '50x30', dpi: 203 } as const
  const bars = (layout: ReturnType<typeof layoutLabel>) => layout.items.find((item) => item.kind === 'bars')
  const texts = (layout: ReturnType<typeof layoutLabel>) =>
    layout.items.flatMap((item) => (item.kind === 'text' ? [item.text] : []))

  it('is the label as it always was until the business changes it', () => {
    expect(buildLabelZpl(label, format, DEFAULT_LABEL_TEMPLATE)).toBe(buildLabelZpl(label, format))
    expect(labelTemplateSchema.parse({})).toEqual(DEFAULT_LABEL_TEMPLATE)
    const layout = layoutLabel(label, format)
    expect(layout).toMatchObject({ width: 400, height: 240 })
    expect(texts(layout)).toEqual(['Futbolka Polo', 'Qora · M', "95 000 so'm", '1001-06  #00002A'])
    expect(bars(layout)).toMatchObject({ x: 16, y: 90, module: 2, height: 44, ean: true })
  })

  it('leaves out what the template leaves out, and gives the room to the barcode', () => {
    const plain = layoutLabel(label, format, {
      ...DEFAULT_LABEL_TEMPLATE,
      showDetails: false,
      showSku: false,
      showTag: false,
      nameLines: 1,
    })
    expect(texts(plain)).toEqual(['Futbolka Polo', "95 000 so'm"])
    // One line of the name and no details: the bars start that much higher and are that much taller.
    expect(bars(plain)).toMatchObject({ y: 40, height: 94 })

    const bare = layoutLabel({ ...label, price: null }, format, {
      ...DEFAULT_LABEL_TEMPLATE,
      showName: false,
      showDetails: false,
      showSku: false,
      showTag: false,
    })
    expect(texts(bare)).toEqual([])
    // Nothing but the barcode: it stops short of the edge, with room for its digits.
    expect(bars(bare)).toMatchObject({ y: 12, height: 152 })

    const none = layoutLabel(label, format, { ...DEFAULT_LABEL_TEMPLATE, showBarcode: false })
    expect(bars(none)).toBeUndefined()
    expect(buildLabelZpl(label, format, { ...DEFAULT_LABEL_TEMPLATE, showBarcode: false })).not.toContain('^BE')
  })

  it('sets the text larger or smaller, and the price larger than the rest', () => {
    const fonts = (template: LabelTemplate) =>
      layoutLabel(label, format, template).items.flatMap((item) => (item.kind === 'text' ? [item.font] : []))
    expect(fonts(DEFAULT_LABEL_TEMPLATE)).toEqual([24, 20, 30, 18])
    expect(fonts({ ...DEFAULT_LABEL_TEMPLATE, text: 'large' })).toEqual([29, 24, 36, 22])
    expect(fonts({ ...DEFAULT_LABEL_TEMPLATE, text: 'small' })).toEqual([20, 17, 26, 15])
    expect(fonts({ ...DEFAULT_LABEL_TEMPLATE, bigPrice: true })).toEqual([24, 20, 42, 18])
    expect(buildLabelZpl(label, format, { ...DEFAULT_LABEL_TEMPLATE, text: 'large' })).toContain(
      '^A0N,29,29^FB368,2,0,L,0^FDFutbolka Polo^FS',
    )
  })

  it('puts the article above the price where the two would run into each other', () => {
    const y = (layout: ReturnType<typeof layoutLabel>, text: string) =>
      layout.items.find((item) => item.kind === 'text' && item.text === text)?.y
    // Side by side on a label 50 mm wide: both end on the same line.
    const wide = layoutLabel(label, format)
    expect(y(wide, "95 000 so'm")).toBe(194)
    expect(y(wide, '1001-06  #00002A')).toBe(206)
    // 40 mm has no room for both: the article moves up, and the bars keep clear of it.
    const narrow = layoutLabel(label, { size: '40x30', dpi: 203 })
    expect(y(narrow, "95 000 so'm")).toBe(194)
    expect(y(narrow, '1001-06  #00002A')).toBe(172)
    expect(bars(narrow)).toMatchObject({ y: 90, height: 44 })
    expect(labelTextWidth("95 000 so'm", 30)).toBe(150)
  })

  it('needs something to know the goods by', () => {
    expect(labelTemplateSchema.safeParse({ showName: false, showBarcode: false, showSku: false }).success).toBe(false)
    expect(labelTemplateSchema.safeParse({ showName: false, showBarcode: false }).success).toBe(true)
  })

  it('does not count on a long run of digits being packed tighter than it is', () => {
    // Twelve digits that are no EAN-13 are a symbol each: 167 modules, too many at two dots on a 40 mm label.
    const zpl = buildLabelZpl({ ...label, barcode: '012345678905' }, { size: '40x30', dpi: 203 })
    expect(zpl).toContain('^BY1^BCN,44,Y,N,N^FD012345678905^FS')
  })
})

describe('labelPrintSchema', () => {
  const base = { items: [{ variantId: ID, count: 3 }], size: '50x30' }
  const refused = (input: unknown) => {
    const result = labelPrintSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
  }

  it('needs to know where tagged goods are', () => {
    expect(refused({ ...base, rfid: true })).toEqual(['locationId'])
    expect(refused({ ...base, rfid: true, locationId: ID })).toEqual([])
    expect(refused({ ...base, rfid: true, receiptId: ID })).toEqual([])
    expect(refused(base)).toEqual([])
  })

  it('refuses a repeated variant and a job that is too large', () => {
    const twice = [
      { variantId: ID, count: 1 },
      { variantId: ID, count: 1 },
    ]
    expect(refused({ ...base, items: twice })).toEqual(['items.1.variantId'])
    const large = [
      { variantId: ID, count: 1500 },
      { variantId: ID2, count: 501 },
    ]
    expect(refused({ ...base, items: large })).toEqual(['items'])
    expect(refused({ ...base, items: [] })).toEqual(['items'])
  })
})

describe('isLocalHost', () => {
  it('takes addresses on the shop network only', () => {
    for (const host of [
      '192.168.1.50',
      '10.0.0.7',
      '172.16.4.1',
      '172.31.255.254',
      '127.0.0.1',
      'printer',
      'cp30.local',
    ]) {
      expect(isLocalHost(host), host).toBe(true)
    }
    for (const host of ['8.8.8.8', '172.32.0.1', '192.169.1.1', 'example.com', '999.1.1.1', '192.168.1', 'a b', '']) {
      expect(isLocalHost(host), host).toBe(false)
    }
  })

  it('guards a printer address', () => {
    const printer = { name: 'CP30', agentId: ID, host: '192.168.1.50', dpi: 203, labelSize: '50x30', rfid: true }
    expect(printerInputSchema.parse(printer)).toMatchObject({ port: 9100, locationId: null })
    expect(printerInputSchema.safeParse({ ...printer, host: 'evil.example.com' }).success).toBe(false)
  })
})
