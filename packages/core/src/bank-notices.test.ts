import { describe, expect, it } from 'vitest'

import { followsOn, parseBankNotice, readBankSum, type BankMove } from './bank-notices'

const som = (amount: number) => Math.round(amount * 100)
const lines = (...parts: string[]) => parts.join('\n')
const move = (text: string) => parseBankNotice(text) as BankMove

describe('a notice from HumoBot', () => {
  it('is read as money arriving: the sum, the place, the card, the time and what is left', () => {
    expect(
      parseBankNotice(
        lines(
          '🎉 To‘ldirish',
          '➕ 375.000,00 UZS',
          '📍 PAYME P2P H2H>TASHKENT',
          '💳 HUMOCARD *3073',
          '🕓 17:46 15.09.2026',
          '💰 40.671.427,77 UZS',
        ),
      ),
    ).toEqual({
      kind: 'move',
      direction: 'in',
      amount: som(375_000),
      currency: 'UZS',
      heading: 'To‘ldirish',
      place: 'PAYME P2P H2H>TASHKENT',
      cardTail: '3073',
      at: '2026-09-15T17:46',
      balance: som(40_671_427.77),
    })
  })

  it('is read as money leaving, whatever hour the clock face shows', () => {
    expect(
      move(
        lines(
          "💸 To'lov",
          '➖ 141.986,00 UZS',
          '📍 OCTOBANK YANDEXEATS',
          '💳 HUMOCARD *3073',
          '🕒 15:01 15.09.2026',
          '💰 39.000.000,00 UZS',
        ),
      ),
    ).toMatchObject({ direction: 'out', amount: som(141_986), at: '2026-09-15T15:01', balance: som(39_000_000) })
  })

  it('trusts the sign over a heading that says otherwise, or says nothing', () => {
    expect(move(lines('💸 Amaliyot', '➕ 10.000,00 UZS', '💳 HUMOCARD *3073')).direction).toBe('in')
    expect(move(lines("🎉 To'ldirish", '➖ 10.000,00 UZS', '💳 HUMOCARD *3073')).direction).toBe('out')
  })

  it('goes by the heading where the sum has no sign', () => {
    expect(
      move(lines("ℹ️ Karta hisobi o'zgardi", '50.000,00 UZS', '💳 HUMOCARD *3073', '🕓 10:05 14.09.2026')),
    ).toMatchObject({ direction: 'in', amount: som(50_000), heading: "Karta hisobi o'zgardi" })
    expect(move(lines('🏧 Naqd pul yechish', '303.000,00 UZS', '💳 HUMOCARD *3073')).direction).toBe('out')
  })

  it('is cut back into its lines when it comes as one', () => {
    expect(
      move("🎉 To'ldirish ➕ 7.000,00 UZS 📍 CLICK P2P 💳 HUMOCARD *3073 🕓 12:09 15.09.2026 💰 1.007.000,00 UZS"),
    ).toMatchObject({
      direction: 'in',
      amount: som(7000),
      place: 'CLICK P2P',
      cardTail: '3073',
      at: '2026-09-15T12:09',
      balance: som(1_007_000),
    })
  })
})

describe('a notice from CardXabarBot', () => {
  it('is read though it writes sums, the date and the card another way', () => {
    expect(
      parseBankNotice(
        lines(
          '🔴 E-Com oplata',
          '➖ 40 000.00 UZS',
          '📍 UZMOBILE GSM CLICK, UZ',
          '💳 ***0887',
          '🕓 16.02.25 13:53',
          '💵 7 771 313.65 UZS',
        ),
      ),
    ).toEqual({
      kind: 'move',
      direction: 'out',
      amount: som(40_000),
      currency: 'UZS',
      heading: 'E-Com oplata',
      place: 'UZMOBILE GSM CLICK, UZ',
      cardTail: '0887',
      at: '2025-02-16T13:53',
      balance: som(7_771_313.65),
    })
  })

  it('is read in the order the bot really writes it: the card before the place', () => {
    // As the bot sends them (figures changed): the heading, the sum, the card, the place, the time, what is left.
    expect(
      parseBankNotice(
        lines(
          '🔴 Spisanie c karty',
          '➖ 100 000.00 UZS',
          '💳 ***7741',
          '📍 TOSHKENT SH., AT KHALK BANKI BOSH AMALIY, UZ',
          '🕓 21.09.26 12:16',
          '💵 582 487.00 UZS',
        ),
      ),
    ).toEqual({
      kind: 'move',
      direction: 'out',
      amount: som(100_000),
      currency: 'UZS',
      heading: 'Spisanie c karty',
      place: 'TOSHKENT SH., AT KHALK BANKI BOSH AMALIY, UZ',
      cardTail: '7741',
      at: '2026-09-21T12:16',
      balance: som(582_487),
    })
    expect(
      move(
        lines(
          '🟢 Popolnenie scheta',
          '➕ 13 046 000.00 UZS',
          '💳 ***0000',
          '📍 E POS ZACH PK, UZ',
          '🕓 30.09.26 12:40',
          '💵 13 048 420.00 UZS',
        ),
      ),
    ).toMatchObject({ direction: 'in', amount: som(13_046_000), cardTail: '0000', balance: som(13_048_420) })
    // A place with figures and commas of its own is still the place, not a sum.
    expect(
      move(
        lines(
          '🔴 Pokupka',
          '➖ 1 700.00 UZS',
          '💳 ***7741',
          '📍 OOO ATTO TOLOV, M ULUGBEK, GP M ULUGBEK UL M ULUGBEK DOM 1',
          '🕓 30.09.26 21:07',
        ),
      ),
    ).toMatchObject({
      direction: 'out',
      amount: som(1700),
      place: 'OOO ATTO TOLOV, M ULUGBEK, GP M ULUGBEK UL M ULUGBEK DOM 1',
      at: '2026-09-30T21:07',
      balance: null,
    })
    // "VISACREDIT2UZCARD" has a figure before letters that begin like a currency: no sum is read out of it.
    expect(
      move(lines('🟢 Perevod na kartu', '➕ 50 000.00 UZS', '💳 ***7741', '📍 IYB VISACREDIT2UZCARD OTH, UZ')),
    ).toMatchObject({ amount: som(50_000), place: 'IYB VISACREDIT2UZCARD OTH, UZ' })
  })

  it('goes by the green and the red mark where the sum has no sign', () => {
    const incoming = move(lines('🟢 Perevod na kartu', '120 000.00 UZS', '💳 ***0887', '🕓 16.02.25 14:10'))
    expect(incoming).toMatchObject({ direction: 'in', amount: som(120_000), heading: 'Perevod na kartu' })
    expect(move(lines('🔴 Operatsiya', '32 000.00 UZS', '💳 ***0887')).direction).toBe('out')
    // And by its words where it has no mark at all.
    // In whichever language the bot was set to write.
    expect(move(lines('Kartaga tushum', '5 000.00 UZS', '💳 ***0887')).direction).toBe('in')
    expect(move(lines('Purchase', '5 000.00 UZS', '💳 ***0887')).direction).toBe('out')
    expect(move(lines('Card top-up', '5 000.00 UZS', '💳 ***0887')).direction).toBe('in')
    expect(move(lines('Perevod na kartu', '5 000.00 UZS', '💳 ***0887')).direction).toBe('in')
  })

  it('takes a place that has no mark for the line that is left over', () => {
    expect(
      move(lines('🔴 E-Com oplata', '➖ 32 000.00 UZS', 'KORZINKA TASHKENT, UZ', '💳 ***0887', '🕓 16.02.25 14:20'))
        .place,
    ).toBe('KORZINKA TASHKENT, UZ')
  })
})

describe('what a reader does not guess at', () => {
  it('is no notice: words with no sum, or a sum nobody says the way of', () => {
    expect(parseBankNotice('Salom, pulni tashladim')).toBeNull()
    expect(parseBankNotice('')).toBeNull()
    // A sum, a card — and nothing that says whether it came or went.
    expect(parseBankNotice(lines('Amaliyot', '10.000,00 UZS', '💳 HUMOCARD *3073'))).toBeNull()
    expect(parseBankNotice(lines('🎉 To‘ldirish', '➕ 0,00 UZS', '💳 HUMOCARD *3073'))).toBeNull()
  })

  it('knows the answer to "what is on the card" from a notice: no money moved', () => {
    expect(parseBankNotice(lines('🔹 HUMOCARD TBCBANK *3073', "💵 33'195'624.29 UZS"))).toEqual({
      kind: 'balance',
      cardTail: '3073',
      balance: som(33_195_624.29),
      currency: 'UZS',
    })
  })

  it('reads a sum in dollars, and the word for so‘m in either alphabet', () => {
    expect(move(lines('🟢 Popolnenie', '➕ 150.00 USD', '💳 ***4411'))).toMatchObject({
      amount: 15_000,
      currency: 'USD',
    })
    expect(move(lines('🎉 To‘ldirish', '➕ 25 000 сум', '💳 *3073')).amount).toBe(som(25_000))
    expect(move(lines('🎉 To‘ldirish', '➕ 25 000 so‘m', '💳 *3073')).currency).toBe('UZS')
  })
})

describe('a sum as a bank writes it', () => {
  it('is read to the tiyin whichever marks group it, and never through a float', () => {
    expect(readBankSum('➕ 375.000,00 UZS')).toBe(37_500_000)
    expect(readBankSum('💰 30.136.124,29 UZS')).toBe(3_013_612_429)
    expect(readBankSum('299.918,80')).toBe(29_991_880)
    expect(readBankSum("33'195'624.29")).toBe(3_319_562_429)
    expect(readBankSum('40 000.00')).toBe(4_000_000)
    expect(readBankSum('7 771 313.65')).toBe(777_131_365)
    // One digit after the mark is tens of tiyin.
    expect(readBankSum('12,5')).toBe(1250)
  })

  it('takes a dot before three digits for thousands, not tiyin', () => {
    expect(readBankSum('125.000 UZS')).toBe(12_500_000)
    expect(readBankSum('1.250')).toBe(125_000)
    expect(readBankSum('UZS')).toBeNull()
  })
})

describe('whether a notice went missing', () => {
  it('is told by what was left on the card: each follows on from the one before', () => {
    const first = { balance: som(7_771_313.65) }
    const next = { direction: 'out' as const, amount: som(32_000), balance: som(7_739_313.65) }
    expect(followsOn(first, next)).toBe(true)
    // A top-up nobody saw came between them.
    expect(followsOn(first, { ...next, balance: som(7_839_313.65) })).toBe(false)
    expect(followsOn({ balance: null }, next)).toBeNull()
  })
})
