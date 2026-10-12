import { describe, expect, it } from 'vitest'

import { guessOpeningMapping, openingMappingProblem, readOpeningRow } from './openings'

const today = { year: 2026, month: 10, day: 12 }

describe('a sheet of opening balances', () => {
  it('is recognised by what its columns are called, in any order and either language', () => {
    expect(
      guessOpeningMapping([
        '№',
        'Mijoz',
        'Telefon raqami',
        'Valyuta',
        'Mijoz qarzi',
        'Bizning qarzimiz',
        'Muddat',
        'Izoh',
      ]),
    ).toEqual({ name: 1, phone: 2, currency: 3, owes: 4, owed: 5, dueDate: 6, note: 7 })
    expect(guessOpeningMapping(['Контрагент', 'Сальдо', 'Валюта', 'Поставщик'])).toEqual({
      name: 0,
      balance: 1,
      currency: 2,
      supplier: 3,
    })
    // The apostrophe is read whichever way it was typed.
    expect(guessOpeningMapping(['Ism', 'Qarzi', 'To‘lash muddati'])).toEqual({ name: 0, owes: 1, dueDate: 2 })
  })

  it('says what it lacks before a row is read', () => {
    expect(openingMappingProblem({ phone: 0, owes: 1 })).toBe('Mijoz ustuni topilmadi')
    expect(openingMappingProblem({ name: 0, phone: 1 })).toContain('Summa ustuni topilmadi')
    expect(openingMappingProblem({ name: 0, balance: 1 })).toBeNull()
  })
})

describe('a row of it', () => {
  const two = { name: 0, phone: 1, currency: 2, owes: 3, owed: 4, dueDate: 5, supplier: 6, note: 7 }
  const read = (cells: unknown[], mapping: Record<string, number> = two) => readOpeningRow(cells, mapping, 2, today)

  it('is what a customer owes, with the day it falls due', () => {
    expect(
      read(['  Nodira  Karimova ', '90 123-45-67', 'so‘m', 1_250_000, null, '15.11.2026', null, 'Eski daftar']),
    ).toEqual({
      row: 2,
      problems: [],
      value: {
        row: 2,
        name: 'Nodira Karimova',
        phone: '+998901234567',
        currency: 'UZS',
        owes: 'customer',
        amount: 125_000_000,
        dueDate: '2026-11-15',
        isSupplier: false,
        note: 'Eski daftar',
      },
    })
  })

  it('is what the business owes: a supplier’s, in dollars, with no day', () => {
    const row = read(['Yiwu Textile', null, 'USD', null, '4 500,50', new Date(Date.UTC(2026, 11, 1)), 'Ha', null])
    expect(row?.value).toMatchObject({
      currency: 'USD',
      owes: 'us',
      amount: 450_050,
      dueDate: null,
      isSupplier: true,
      phone: null,
    })
  })

  it('reads one column of balances by its sign, however a minus is written', () => {
    const one = { name: 0, balance: 1, dueDate: 2 }
    expect(read(['Aziz', 300_000, new Date(Date.UTC(2026, 10, 20))], one)?.value).toMatchObject({
      owes: 'customer',
      amount: 30_000_000,
      dueDate: '2026-11-20',
      currency: null,
    })
    expect(read(['Aziz', -300_000], one)?.value).toMatchObject({ owes: 'us', amount: 30_000_000 })
    expect(read(['Aziz', '−300 000'], one)?.value).toMatchObject({ owes: 'us', amount: 30_000_000 })
    expect(read(['Aziz', '(300 000)'], one)?.value).toMatchObject({ owes: 'us', amount: 30_000_000 })
  })

  it('is passed over when it is empty, or names somebody who owes nothing either way', () => {
    expect(read([null, null, null, null, null, null, null, null])).toBeNull()
    expect(read(['Bobur', null, null, 0, null, null, null, null])).toBeNull()
    expect(read(['Bobur', '90 111 22 33', null, null, null, null, null, null])).toBeNull()
  })

  it('says what is wrong with it', () => {
    expect(read([null, null, null, 500, null, null, null, null])?.problems).toEqual(['Mijoz yozilmagan'])
    expect(read(['Bobur', '12345', 'tugrik', 'ko‘p', null, 'ertadan keyin', null, null])?.problems).toEqual([
      'Summa noto‘g‘ri yozilgan',
      'Valyuta tanilmadi: tugrik',
      'Telefon noto‘g‘ri: 12345',
      'Muddat noto‘g‘ri: ertadan keyin',
    ])
    expect(read(['Bobur', null, null, 500, 300, null, null, null])?.problems).toEqual([
      'Ikkala ustunda ham summa bor: mijoz qarzi yoki bizning qarzimiz',
    ])
    expect(read(['Bobur', null, null, -500, null, null, null, null])?.problems[0]).toContain('manfiy son')
  })
})
