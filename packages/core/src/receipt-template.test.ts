import { describe, expect, it } from 'vitest'

import { DEFAULT_RECEIPT_TEMPLATE, receiptTemplateSchema, saleNumberOf } from './receipt-template'

describe('receiptTemplateSchema', () => {
  it('fills in what a business did not set', () => {
    expect(receiptTemplateSchema.parse({ footer: 'Xaridingiz uchun rahmat!' })).toEqual(DEFAULT_RECEIPT_TEMPLATE)
  })

  it('takes a small picture for a logo and nothing else', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo='
    expect(receiptTemplateSchema.parse({ logo, logoWidth: 35 })).toMatchObject({ logo, logoWidth: 35 })
    expect(receiptTemplateSchema.parse({ logo: '' }).logo).toBeNull()
    expect(receiptTemplateSchema.safeParse({ logo: 'https://example.com/logo.png' }).success).toBe(false)
    expect(receiptTemplateSchema.safeParse({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false)
    expect(receiptTemplateSchema.safeParse({ logo: `data:image/png;base64,${'A'.repeat(200_000)}` }).success).toBe(
      false,
    )
    expect(receiptTemplateSchema.safeParse({ logoWidth: 10 }).success).toBe(false)
  })
})

describe('saleNumberOf', () => {
  it('knows a receipt number however the scanner typed it', () => {
    expect(saleNumberOf('CH-000123')).toBe('CH-000123')
    expect(saleNumberOf(' ch-000123 ')).toBe('CH-000123')
    // The same keys with the Russian layout on.
    expect(saleNumberOf('СР-000123')).toBe('CH-000123')
    expect(saleNumberOf('ср-1234567')).toBe('CH-1234567')
  })

  it('does not take a barcode or an article for one', () => {
    expect(saleNumberOf('2000000000015')).toBeNull()
    expect(saleNumberOf('8018-09')).toBeNull()
    expect(saleNumberOf('CH-12')).toBeNull()
    expect(saleNumberOf('QT-000123')).toBeNull()
  })
})
