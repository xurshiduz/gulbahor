/**
 * Search keys. Names are written in Latin and Cyrillic, "o'" comes in five
 * shapes, and people type with the wrong keyboard layout on. All of that is
 * folded into one lowercase Latin key, stored next to each searchable row
 * and computed the same way for the query.
 */

const APOSTROPHES = /['‘’ʻʼ`´]/g

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q',
  ғ: "g'", ҳ: 'h', і: 'i', ї: 'yi', є: 'ye',
}

const RU_LAYOUT = 'йцукенгшщзхъфывапролджэячсмитьбюё'
const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"

export function cyrillicToLatin(text: string): string {
  let result = ''
  for (const char of text) {
    const lower = char.toLowerCase()
    const mapped = CYRILLIC_TO_LATIN[lower]
    result += mapped === undefined ? char : mapped
  }
  return result
}

/** Text typed on a Russian layout while meaning Latin letters: "ащгтв" -> "found". */
export function ruLayoutToEn(text: string): string {
  return swapLayout(text, RU_LAYOUT, EN_LAYOUT)
}

/** Text typed on a Latin layout while meaning Cyrillic letters: "fydfh" -> "анвар". */
export function enLayoutToRu(text: string): string {
  return swapLayout(text, EN_LAYOUT, RU_LAYOUT)
}

function swapLayout(text: string, from: string, to: string): string {
  let result = ''
  for (const char of text.toLowerCase()) {
    const index = from.indexOf(char)
    result += index === -1 ? char : to[index]
  }
  return result
}

/** Folds text into its search key: "Oʻg‘il  Кийим, XL" -> "ogil kiyim xl". */
export function searchKey(text: string | null | undefined): string {
  if (!text) {
    return ''
  }
  let key = cyrillicToLatin(text.normalize('NFKC').toLowerCase())
  key = key.replace(APOSTROPHES, '')
  key = key.normalize('NFKD').replace(/[̀-ͯ]/g, '')
  key = key.replace(/[^a-z0-9]+/g, ' ').trim()
  // "Елена" becomes "elena" but is often written "Yelena"; fold both the same way.
  key = key.replace(/\bye/g, 'e').replace(/\byo/g, 'o')
  return key
}

/**
 * The keys a query should be tried as: as typed, and, for longer queries,
 * as if the keyboard layout had been wrong.
 */
export function queryKeys(query: string): string[] {
  const keys = new Set<string>()
  const direct = searchKey(query)
  if (direct) {
    keys.add(direct)
  }
  const trimmed = query.trim()
  if (trimmed.length >= 3) {
    if (/[а-яё]/i.test(trimmed)) {
      keys.add(searchKey(ruLayoutToEn(trimmed)))
    }
    if (/^[a-z[\];',.`\s]+$/i.test(trimmed)) {
      keys.add(searchKey(enLayoutToRu(trimmed)))
    }
  }
  keys.delete('')
  return [...keys]
}

/**
 * How well a stored key matches a query, 0 meaning not at all. Every word of
 * the query must appear; the order of words does not matter.
 */
export function matchScore(queryKeysList: readonly string[], textKey: string): number {
  let best = 0
  for (const key of queryKeysList) {
    const words = key.split(' ').filter(Boolean)
    if (!words.length || !words.every((word) => textKey.includes(word))) {
      continue
    }
    let score = 40
    if (textKey === key) {
      score = 100
    } else if (textKey.startsWith(key)) {
      score = 80
    } else if (words.every((word) => textKey.startsWith(word) || textKey.includes(` ${word}`))) {
      score = 60
    }
    // The query as typed beats a layout guess that happens to match.
    if (key !== queryKeysList[0]) {
      score -= 5
    }
    best = Math.max(best, score)
  }
  return best
}
