import { DEFAULT_RECEIPT_TEMPLATE, type ReceiptTemplate, type SaleDto } from '@erp/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ReceiptPaper } from './receipt-paper'
import { sampleSale } from './receipt-sample'

/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

const sale = sampleSale({ name: 'Gulbahor 1', address: 'Chilonzor, 12-uy', phone: '+998901234567' })
const printed = (template: Partial<ReceiptTemplate> = {}) => {
  const { container, unmount } = render(
    <ReceiptPaper sale={sale} template={{ ...DEFAULT_RECEIPT_TEMPLATE, ...template }} orgName="Gulbahor" />,
  )
  const paper = container.querySelector('[data-receipt-paper]') as HTMLElement
  const result = { text: plain(paper.textContent), width: paper.style.width }
  unmount()
  return result
}

describe('a receipt on paper', () => {
  it('says what was sold, what came off and why, and how it was paid', () => {
    const { text, width } = printed()
    expect(width).toBe('72mm')
    expect(text).toContain('Gulbahor')
    expect(text).toContain('CH-000128')
    expect(text).toContain('Ko‘ylak, Qora, M')
    expect(text).toContain('1 × 900 000 so‘m − 160 000 so‘m')
    expect(text).toContain('Sodiqlik 10%−117 000 so‘m')
    // What the cashier gave is said apart from what came off by itself.
    expect(text).toContain('Chegirma−70 000 so‘m')
    expect(text).toContain('Jami983 000 so‘m')
    expect(text).toContain('Kartaga · Humo *3073500 000 so‘m')
    expect(text).toContain('Siz 187 000 so‘m tejadingiz')
    expect(text).toContain('Xaridingiz uchun rahmat!')
    // The article is not printed unless the business asks for it.
    expect(text).not.toContain('1042-03')
  })

  it('says of a line sold at a price type with no price for it where its price came from', () => {
    const marked = (priceFrom: 'retail' | 'formula' | null) => {
      const { container, unmount } = render(
        <ReceiptPaper
          sale={{ ...sale, lines: sale.lines.map((line, index) => (index ? line : { ...line, priceFrom })) }}
          template={DEFAULT_RECEIPT_TEMPLATE}
          orgName="Gulbahor"
        />,
      )
      const text = plain(container.querySelector('[data-receipt-paper]')?.textContent ?? '')
      unmount()
      return text
    }
    expect(marked('retail')).toContain('Chakana narxida')
    expect(marked('formula')).toContain('qoida bo‘yicha')
    expect(marked(null)).not.toContain('Chakana narxida')
  })

  it('is laid out by the template: what is switched off is not printed', () => {
    const bare = printed({
      width: 58,
      title: 'GULBAHOR STYLE',
      showShop: false,
      showAddress: false,
      showCashier: false,
      showSeller: false,
      showCustomer: false,
      showLineDiscount: false,
      showSavings: false,
      showSku: true,
      footer: null,
      socials: 'Instagram: @gulbahor\nTelegram: @gulbahor_uz',
    })
    expect(bare.width).toBe('48mm')
    expect(bare.text).toContain('GULBAHOR STYLE')
    for (const hidden of ['Gulbahor 1', 'Chilonzor', 'Dilnoza', 'Sardor', 'Nodira', 'tejadingiz', 'rahmat']) {
      expect(bare.text).not.toContain(hidden)
    }
    // The line still says how many at what price; what came off it is in the totals alone.
    expect(bare.text).toContain('1 × 900 000 so‘m')
    expect(bare.text).not.toContain('− 160 000 so‘m')
    expect(bare.text).toContain('1042-03')
    expect(bare.text).toContain('Instagram: @gulbahorTelegram: @gulbahor_uz')
    // The sums are never a matter of design.
    expect(bare.text).toContain('Jami983 000 so‘m')
  })

  it('names what went on the account, and the day it is to be paid by', () => {
    const lent = {
      ...sale,
      payments: [
        sale.payments[0],
        {
          ...sale.payments[1],
          method: 'account',
          accountName: 'Nodira Yusupova',
          currency: 'UZS',
          amount: 48_300_000,
          base: 48_300_000,
        },
      ],
      due: { id: 'd1', dueDate: '2026-11-04' },
      owes: [{ currency: 'UZS', balance: 180_000_000 }],
    } as SaleDto
    const { container } = render(<ReceiptPaper sale={lent} template={DEFAULT_RECEIPT_TEMPLATE} orgName="Gulbahor" />)
    const text = plain(container.querySelector('[data-receipt-paper]')?.textContent ?? null)
    // The account is the customer's, not a place: its name in the books stays off the paper.
    expect(text).toContain('Mijoz balansi483 000 so‘m')
    expect(text).not.toContain('Nodira Yusupova483')
    expect(text).toContain('To‘lash muddati04.11.2026')
    // What they owe in all after it, and a line to put their name to.
    expect(text).toContain('Jami qarzi1 800 000 so‘m')
    expect(text).toContain('Xaridor imzosi:')
    expect(container.querySelector('[data-signature]')).not.toBeNull()
    // Nothing owed, no day, and nothing to sign.
    expect(printed().text).not.toContain('To‘lash muddati')
    expect(printed().text).not.toContain('Xaridor imzosi')
  })

  it('carries its number as a barcode, and the logo the business gave it', () => {
    const paper = (template: Partial<ReceiptTemplate> = {}) =>
      render(<ReceiptPaper sale={sale} template={{ ...DEFAULT_RECEIPT_TEMPLATE, ...template }} orgName="Gulbahor" />)
        .container

    const usual = paper()
    const bars = usual.querySelector('[data-receipt-barcode]') as SVGElement
    // "CH-000128": nine characters, eleven modules each and thirty-five around them, a quarter of a millimetre a module.
    expect(bars.getAttribute('viewBox')).toBe('0 0 134 1')
    expect(bars.style.width).toBe('33.5mm')
    expect(bars.querySelectorAll('rect').length).toBeGreaterThan(30)
    expect(usual.querySelector('img')).toBeNull()

    expect(paper({ showBarcode: false }).querySelector('[data-receipt-barcode]')).toBeNull()

    const logo = 'data:image/png;base64,iVBORw0KGgo='
    const image = paper({ logo, logoWidth: 70 }).querySelector('img') as HTMLImageElement
    expect(image.getAttribute('src')).toBe(logo)
    expect(image.style.width).toBe('70%')
  })
})
