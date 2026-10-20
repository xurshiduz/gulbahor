import { describe, expect, it } from 'vitest'

import { cyrillicOf, toCyrillic } from './cyrillic'

describe('Uzbek in Cyrillic', () => {
  it('writes the Latin letters as the Cyrillic ones', () => {
    expect(toCyrillic('Saqlash')).toBe('Сақлаш')
    expect(toCyrillic('yo‘q')).toBe('йўқ')
    expect(toCyrillic('So‘m naqd')).toBe('Сўм нақд')
    expect(toCyrillic('G‘azna')).toBe('Ғазна')
    expect(toCyrillic('Yetkazib beruvchi')).toBe('Етказиб берувчи')
    expect(toCyrillic('Ekranni bloklash')).toBe('Экранни блоклаш')
    expect(toCyrillic('ma’lumot')).toBe('маълумот')
    expect(toCyrillic('Yangi chek')).toBe('Янги чек')
    expect(toCyrillic('yozuv, yuk')).toBe('ёзув, юк')
  })

  it('leaves alone what is not Uzbek', () => {
    expect(toCyrillic('{{count}} ta dona')).toBe('{{count}} та дона')
    expect(toCyrillic('RFID kod, F9')).toBe('RFID код, F9')
    expect(toCyrillic('Excel faylga')).toBe('Excel файлга')
    expect(toCyrillic('<b>Diqqat</b>')).toBe('<b>Диққат</b>')
  })

  it('goes through a whole dictionary', () => {
    expect(cyrillicOf({ a: 'Ha', b: { c: 'Yo‘q' } })).toEqual({ a: 'Ҳа', b: { c: 'Йўқ' } })
  })
})
