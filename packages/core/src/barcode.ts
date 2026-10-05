/**
 * Barcodes as rows of modules — '1' a bar, '0' a space — for whatever draws
 * them itself: a receipt printed from the browser, a label shown on screen.
 * A label printer draws its own from the code alone.
 */

/**
 * Code 128: each symbol is three bars and three spaces, eleven modules in
 * all, written here as their widths turn about. Ten symbols a row, from
 * value 0; the last three start a symbol in subsets A, B and C.
 */
const CODE128 = [
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213',
  '221312 231212 112232 122132 122231 113222 123122 123221 223211 221132',
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211',
  '212123 212321 232121 111323 131123 131321 112313 132113 132311 211313',
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331',
  '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111',
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214',
  '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111',
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141',
  '214121 412121 111143 111341 131141 114113 114311 411113 411311 113141',
  '114131 311141 411131 211412 211214 211232',
].flatMap((row) => row.split(' '))
/** The stop has a bar more than the rest. */
const CODE128_STOP = '2331112'
const START_B = 104

/** The widths of a symbol's bars and spaces as modules. */
const drawn = (widths: string) =>
  [...widths].map((width, index) => (index % 2 === 0 ? '1' : '0').repeat(Number(width))).join('')

/** For the tests: the table itself. */
export const CODE128_PATTERNS: readonly string[] = [...CODE128, CODE128_STOP]

/**
 * Code 128, subset B: any printable ASCII, a character a symbol. Null for
 * what it cannot carry.
 */
export function code128(text: string): string | null {
  if (!text || !/^[\x20-\x7e]+$/.test(text)) {
    return null
  }
  const values = [...text].map((char) => char.charCodeAt(0) - 32)
  const check = values.reduce((sum, value, index) => sum + value * (index + 1), START_B) % 103
  return [START_B, ...values, check].map((value) => drawn(CODE128[value])).join('') + drawn(CODE128_STOP)
}

/** How many modules wide that symbol is: eleven a character, and the start, the check and the stop. */
export const code128Width = (text: string): number => text.length * 11 + 35

/** EAN-13: a digit of the left half is written one of two ways, and which way each is written is the first digit. */
const EAN_LEFT = '0001101 0011001 0010011 0111101 0100011 0110001 0101111 0111011 0110111 0001011'.split(' ')
const EAN_FIRST = 'LLLLLL LLGLGG LLGGLG LLGGGL LGLLGG LGGLLG LGGGLL LGLGLG LGLGGL LGGLGL'.split(' ')
const flipped = (bits: string) => [...bits].map((bit) => (bit === '1' ? '0' : '1')).join('')
const reversed = (bits: string) => [...bits].reverse().join('')

/** EAN-13 from its thirteen digits: ninety-five modules, the quiet zones not among them. Null for anything else. */
export function ean13(code: string): string | null {
  if (!/^\d{13}$/.test(code)) {
    return null
  }
  const digits = [...code].map(Number)
  const ways = EAN_FIRST[digits[0]]
  const left = digits
    .slice(1, 7)
    .map((digit, index) => (ways[index] === 'L' ? EAN_LEFT[digit] : reversed(flipped(EAN_LEFT[digit]))))
  const right = digits.slice(7).map((digit) => flipped(EAN_LEFT[digit]))
  return `101${left.join('')}01010${right.join('')}101`
}

/** The bars in a row of modules: where each starts, and how many modules wide it is. */
export function barRuns(modules: string): { at: number; width: number }[] {
  const runs: { at: number; width: number }[] = []
  for (let index = 0; index < modules.length; index += 1) {
    if (modules[index] !== '1') {
      continue
    }
    const last = runs[runs.length - 1]
    if (last && last.at + last.width === index) {
      last.width += 1
    } else {
      runs.push({ at: index, width: 1 })
    }
  }
  return runs
}
