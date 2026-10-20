/**
 * Uzbek in Cyrillic is the Latin dictionary written in the other script: worked out here rather than kept as a
 * third dictionary, so a text added in Latin is never missing in Cyrillic. What is not Uzbek stays as it is: a
 * placeholder, a tag, an abbreviation in capitals (RFID, F9), a foreign word with a c or a w in it (Excel, Ctrl).
 */
const LETTERS: [RegExp, string][] = [
  [/^(o‘|o'|oʻ|o`)/i, 'ў'],
  [/^(g‘|g'|gʻ|g`)/i, 'ғ'],
  [/^yo(?![‘'ʻ`])/i, 'ё'],
  [/^yu/i, 'ю'],
  [/^ya/i, 'я'],
  [/^ye/i, 'е'],
  [/^sh/i, 'ш'],
  [/^ch/i, 'ч'],
]

const SINGLE: Record<string, string> = {
  a: 'а',
  b: 'б',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'ҳ',
  i: 'и',
  j: 'ж',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'қ',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  x: 'х',
  y: 'й',
  z: 'з',
}

const VOWELS = /[aeiouаеиоуўэёюя]/i
const APOSTROPHES = /[’ʼ]/

function word(latin: string): string {
  // Not an Uzbek word: kept in the letters it was written in.
  if (/\d|c(?!h)|w/i.test(latin) || (latin.length > 1 && latin === latin.toUpperCase() && /[A-Z]/.test(latin))) {
    return latin
  }
  let out = ''
  let rest = latin
  while (rest) {
    const lower = rest[0].toLowerCase()
    const upper = rest[0] !== lower
    let piece: string | null = null
    let taken = 1
    for (const [pattern, cyrillic] of LETTERS) {
      const match = pattern.exec(rest)
      if (match) {
        piece = cyrillic
        taken = match[0].length
        break
      }
    }
    if (piece === null) {
      if (APOSTROPHES.test(rest[0])) {
        piece = 'ъ'
      } else if (lower === 'e' && (!out || VOWELS.test(out[out.length - 1]))) {
        // At the start of a word, or after a vowel, «e» is «э».
        piece = 'э'
      } else {
        piece = SINGLE[lower] ?? rest[0]
      }
    }
    out += upper ? piece.toUpperCase() : piece
    rest = rest.slice(taken)
  }
  return out
}

/** One text: placeholders and tags are left alone, every word outside them is written in Cyrillic. */
export function toCyrillic(text: string): string {
  return text
    .split(/(\{\{[^}]*\}\}|<[^>]*>|\$t\([^)]*\))/)
    .map((part, index) =>
      index % 2 ? part : part.replace(/[A-Za-z0-9‘'ʻ`’ʼ]+/g, (run) => (/^[‘'ʻ`’ʼ]+$/.test(run) ? run : word(run))),
    )
    .join('')
}

/** A whole dictionary, key for key. */
export function cyrillicOf<T>(dictionary: T): T {
  if (typeof dictionary === 'string') {
    return toCyrillic(dictionary) as T
  }
  if (Array.isArray(dictionary)) {
    return dictionary.map((item: unknown) => cyrillicOf(item)) as T
  }
  if (dictionary && typeof dictionary === 'object') {
    return Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [key, cyrillicOf(value)])) as T
  }
  return dictionary
}
