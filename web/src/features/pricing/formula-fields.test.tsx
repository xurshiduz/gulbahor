import { formulaText, priceBy } from '@erp/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { FormulaFields, formulaOf, formulaRowOf, NO_FORMULA, type FormulaRow, type FormulaWay } from './formula-fields'

const som = (amount: number) => amount * 100
const plain = (text: string) => text.replace(/\s/g, ' ')

function Fields({ start = NO_FORMULA, ways }: { start?: FormulaRow; ways?: FormulaWay[] }) {
  const [row, setRow] = useState(start)
  const formula = formulaOf(row)
  return (
    <>
      <FormulaFields value={row} onChange={setRow} currency="UZS" noneLabel="Qo‘lda" ways={ways} />
      <p data-said>{formula ? plain(formulaText(formula, 'UZS')) : 'yo‘q'}</p>
    </>
  )
}

const said = () => document.querySelector('[data-said]')?.textContent

describe('a formula as it is entered', () => {
  it('goes to the fields and back unchanged, whichever way it points', () => {
    for (const formula of [
      { base: 'cost', percent: 30, amount: som(5000) },
      { base: 'cost', percent: 0, amount: 0 },
      { base: 'retail', percent: -15, amount: 0 },
      { base: 'retail', percent: -15, amount: -som(2000) },
      { base: 'retail', percent: 5, amount: som(1000) },
      { base: 'fixed', percent: 0, amount: som(180_000) },
    ] as const) {
      expect(formulaOf(formulaRowOf(formula))).toEqual(formula)
    }
    expect(formulaRowOf(null)).toEqual(NO_FORMULA)
    expect(formulaOf(NO_FORMULA)).toBeNull()
    // A price to be named, and none typed: nothing yet.
    expect(formulaOf({ way: 'fixed', percent: null, amount: null })).toBeNull()
    // Under the retail price, both the percentage and the sum come off.
    expect(formulaRowOf({ base: 'retail', percent: -15, amount: -som(2000) })).toEqual({
      way: 'retail_less',
      percent: 15,
      amount: som(2000),
    })
  })

  it('makes of a cost what the three fields say', () => {
    const formula = formulaOf({ way: 'cost', percent: 20, amount: som(5000) })!
    expect(priceBy(formula, { cost: som(100_000), retail: null }, { step: som(1000), ending: 0 })).toBe(som(125_000))
  })
})

describe('the formula fields', () => {
  it('show a percentage and a sum for a price that is worked out, and the sum alone for one named outright', async () => {
    render(<Fields start={formulaRowOf({ base: 'cost', percent: 30, amount: som(5000) })} />)
    expect(said()).toBe('tannarx + 30% + 5 000 so‘m')
    const [percent, sum] = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(percent.value).toBe('30')
    expect(plain(sum.value)).toBe('5 000')
    await userEvent.clear(percent)
    await userEvent.type(percent, '45{Tab}')
    expect(said()).toBe('tannarx + 45% + 5 000 so‘m')
  })

  it('has no fields where nothing is worked out', () => {
    render(<Fields />)
    expect(said()).toBe('yo‘q')
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByRole('combobox').textContent).toContain('Qo‘lda')
  })

  it('takes the sum for the price when one is named outright', async () => {
    render(<Fields start={{ way: 'fixed', percent: null, amount: null }} />)
    const fields = screen.getAllByRole('textbox')
    expect(fields).toHaveLength(1)
    await userEvent.type(fields[0], '180000{Tab}')
    expect(said()).toBe('180 000 so‘m')
  })
})
