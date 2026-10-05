import { DEFAULT_RECEIPT_TEMPLATE, type ReceiptTemplate } from '@gulbahor/core'
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
    expect(text).toContain("Ko'ylak, Qora, M")
    expect(text).toContain("1 × 900 000 so'm − 160 000 so'm")
    expect(text).toContain("Sodiqlik 10%−117 000 so'm")
    // What the cashier gave is said apart from what came off by itself.
    expect(text).toContain("Chegirma−70 000 so'm")
    expect(text).toContain("Jami983 000 so'm")
    expect(text).toContain("Kartaga · Humo *3073500 000 so'm")
    expect(text).toContain("Siz 187 000 so'm tejadingiz")
    expect(text).toContain('Xaridingiz uchun rahmat!')
    // The article is not printed unless the business asks for it.
    expect(text).not.toContain('1042-03')
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
    expect(bare.text).toContain("1 × 900 000 so'm")
    expect(bare.text).not.toContain("− 160 000 so'm")
    expect(bare.text).toContain('1042-03')
    expect(bare.text).toContain('Instagram: @gulbahorTelegram: @gulbahor_uz')
    // The sums are never a matter of design.
    expect(bare.text).toContain("Jami983 000 so'm")
  })
})
