import type { AccountDto, RateBook } from '@gulbahor/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { MoneyInput } from '@/components/ui/money-input'

import { exchangeLine, ReceivedField, receivedOf, transferSums, type ExchangeSums } from './exchange'

/** Money is set with spaces that do not break; read, they are spaces. */
const read = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)

/** So'm the base, the dollar 12 850, the yuan named against the dollar. */
const book: RateBook = {
  base: 'UZS',
  rates: { USD: { against: 'UZS', way: 'in', value: 12_850 }, CNY: { against: 'USD', way: 'per', value: 7.25 } },
}

const place = (id: string, currency: AccountDto['currency']) => ({ id, currency }) as AccountDto
const somSafe = place('som', 'UZS')

describe('an exchange', () => {
  it('is no exchange between places of one currency: one sum is all there is', () => {
    expect(exchangeLine(somSafe, 'UZS', { amount: som(100_000), received: null }, book, 2)).toBeNull()
    expect(exchangeLine(null, 'USD', { amount: som(100_000), received: null }, book, 2)).toBeNull()
  })

  it('makes what enters from the day’s rate, along the chain where neither currency is the base', () => {
    const line = exchangeLine(somSafe, 'USD', { amount: som(1_000_000), received: null }, book, 2)!
    expect(line).toMatchObject({ settled: usd(77.82), agreed: false, dayRate: 12_850 })
    // Left to the rate, nothing is sent as agreed: the server makes it itself.
    expect(receivedOf(line)).toBeNull()
    const yuan = exchangeLine(place('usd', 'USD'), 'CNY', { amount: usd(100), received: null }, book, 2)!
    expect(yuan).toMatchObject({ settled: 72_500, agreed: false, dayRate: 7.25 })
  })

  it('says what moves, both sums where it is changed', () => {
    expect(read(transferSums({ amount: usd(1000), currency: 'USD', toAmount: 725_000, toCurrency: 'CNY' }))).toBe(
      '1 000,00 $ → 7 250,00 ¥',
    )
    expect(read(transferSums({ amount: usd(1000), currency: 'USD', toAmount: usd(1000), toCurrency: 'USD' }))).toBe(
      '1 000,00 $',
    )
  })

  describe('as two fields', () => {
    let latest: ExchangeSums = { amount: null, received: null }
    function Fields({ setsRates = false }: { setsRates?: boolean }) {
      const [sums, setSums] = useState<ExchangeSums>({ amount: null, received: null })
      latest = sums
      const line = exchangeLine(somSafe, 'USD', sums, book, 2)!
      return (
        <>
          <label htmlFor="out">Chiqadi</label>
          <MoneyInput
            id="out"
            value={sums.amount}
            onChange={(amount) => setSums({ amount, received: null })}
            currency="UZS"
          />
          <ReceivedField
            line={line}
            sums={sums}
            toCurrency="USD"
            onChange={setSums}
            book={book}
            setsRates={setsRates}
          />
        </>
      )
    }

    it('works what enters out of what leaves, and the day’s rate is said under it', async () => {
      render(<Fields />)
      await userEvent.type(screen.getByLabelText('Chiqadi'), '1000000{Tab}')
      expect((screen.getByLabelText('Kiradi (Dollar)') as HTMLInputElement).value).toBe('77,82')
      expect(screen.getByText('Kun kursi: 1 $ = 12 850 so‘m')).toBeTruthy()
      expect(latest).toEqual({ amount: som(1_000_000), received: null })
      expect(document.querySelector('[data-agreed]')).toBeNull()
    })

    it('keeps what leaves when what enters is typed over, and says what the agreement gives', async () => {
      render(<Fields />)
      await userEvent.type(screen.getByLabelText('Chiqadi'), '1000000{Tab}')
      const into = screen.getByLabelText('Kiradi (Dollar)')
      await userEvent.clear(into)
      await userEvent.type(into, '78{Tab}')
      expect(latest).toEqual({ amount: som(1_000_000), received: usd(78) })
      expect((screen.getByLabelText('Chiqadi') as HTMLInputElement).value).toBe('1 000 000')
      // 78 $ for a million is 12 820,51 against 12 850: the dollars that enter are worth 2 300 so'm more.
      expect(read(document.querySelector('[data-agreed]')?.textContent)).toBe(
        'Kelishilgan kurs 12 820,51, kun kursi 12 850 (0,2% farq): 2 300 so‘m foydamizga',
      )
    })

    it('says what it costs, and that it takes someone who sets rates past the limit', async () => {
      render(<Fields />)
      await userEvent.type(screen.getByLabelText('Chiqadi'), '1000000{Tab}')
      const into = screen.getByLabelText('Kiradi (Dollar)')
      await userEvent.clear(into)
      await userEvent.type(into, '75{Tab}')
      expect(read(document.querySelector('[data-agreed]')?.textContent)).toBe(
        'Kelishilgan kurs 13 333,33, kun kursi 12 850 (3,6% farq): 36 250 so‘m zararimizga — kurs qo‘yish ruxsati kerak',
      )
    })

    it('works what has to leave out of what is to enter, while nothing leaves yet', async () => {
      render(<Fields />)
      await userEvent.type(screen.getByLabelText('Kiradi (Dollar)'), '100{Tab}')
      expect(latest).toEqual({ amount: som(1_285_000), received: usd(100) })
      expect((screen.getByLabelText('Chiqadi') as HTMLInputElement).value).toBe('1 285 000')
      // Both made by the day's rate: nothing was agreed.
      expect(document.querySelector('[data-agreed]')).toBeNull()
    })
  })
})
