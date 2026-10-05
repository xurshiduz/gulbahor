import { DEFAULT_LABEL_TEMPLATE, type LabelData, type LabelTemplate } from '@gulbahor/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LabelPreview, wrapLabelText } from './label-preview'

const label: LabelData = {
  name: "Ayollar ko'ylagi uzun, yozgi kolleksiya",
  details: 'Qora · 44',
  sku: '8018-08',
  barcode: '2000000000015',
  price: "910 000 so'm",
  epc: '47554C00000000000000002A',
}

const shown = (template: Partial<LabelTemplate> = {}, data: Partial<LabelData> = {}) => {
  const { container, unmount } = render(
    <LabelPreview
      label={{ ...label, ...data }}
      format={{ size: '50x30', dpi: 203 }}
      template={{ ...DEFAULT_LABEL_TEMPLATE, ...template }}
    />,
  )
  const svg = container.querySelector('[data-label-preview]') as SVGElement
  const result = {
    box: svg.getAttribute('viewBox'),
    texts: [...svg.querySelectorAll('text')].map((text) => text.textContent),
    bars: svg.querySelectorAll('rect').length,
  }
  unmount()
  return result
}

describe('a label on screen', () => {
  it('shows what the printer will be told to print', () => {
    const { box, texts, bars } = shown()
    expect(box).toBe('0 0 400 240')
    // A long name runs onto a second line, as the printer breaks it.
    expect(texts).toEqual([
      "Ayollar ko'ylagi uzun, yozgi",
      'kolleksiya',
      'Qora · 44',
      '2000000000015',
      "910 000 so'm",
      '8018-08  #00002A',
    ])
    // An EAN-13 has thirty bars.
    expect(bars).toBe(30)
  })

  it('follows the template and what is printed with it', () => {
    const plain = shown({ nameLines: 1, showDetails: false, showTag: false }, { price: null })
    expect(plain.texts).toEqual(["Ayollar ko'ylagi uzun, yozgi", '2000000000015', '8018-08'])
    expect(shown({ showBarcode: false }).bars).toBe(0)
    // With no barcode of its own, a thing is known by its article.
    expect(shown({}, { barcode: null }).texts).toContain('8018-08')
  })
})

describe('wrapLabelText', () => {
  it('breaks at the spaces and cuts a word that is longer than a line', () => {
    expect(wrapLabelText('Futbolka Polo', 24, 368, 2)).toEqual(['Futbolka Polo'])
    expect(wrapLabelText('aaaa bbbb cccc', 20, 90, 3)).toEqual(['aaaa bbbb', 'cccc'])
    expect(wrapLabelText('abcdefghijklmnop', 20, 100, 2)).toEqual(['abcdefghij', 'klmnop'])
    expect(wrapLabelText('one two three four', 20, 60, 2)).toEqual(['one', 'two'])
  })
})
