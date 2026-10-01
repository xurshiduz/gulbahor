export type PhoneResult =
  | { ok: true; e164: string; national: string; display: string }
  | { ok: false; error: 'empty' | 'incomplete' | 'invalid' }

/**
 * Accepts an Uzbek number in any common shape: "901234567",
 * "+998 90 123 45 67", "998901234567", "8 90 123-45-67".
 */
export function parsePhone(input: string): PhoneResult {
  const digits = input.replace(/\D/g, '')
  if (!digits) {
    return { ok: false, error: 'empty' }
  }

  let national: string
  if (digits.length === 12 && digits.startsWith('998')) {
    national = digits.slice(3)
  } else if (digits.length === 9) {
    national = digits
  } else if (digits.length === 10 && digits.startsWith('8')) {
    national = digits.slice(1)
  } else if (digits.length < 9 || (digits.startsWith('998') && digits.length < 12)) {
    return { ok: false, error: 'incomplete' }
  } else {
    return { ok: false, error: 'invalid' }
  }

  return { ok: true, e164: `+998${national}`, national, display: formatNational(national) }
}

/** "901234567" -> "+998 90 123 45 67" */
export function formatNational(national: string): string {
  const n = national.padEnd(9, ' ')
  return `+998 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`.trimEnd()
}

/**
 * Formats a number while it is being typed, for the input itself:
 * "90123" -> "90 123". The country code is shown outside the field.
 */
export function formatPhoneTyping(input: string): string {
  let digits = input.replace(/\D/g, '')
  // Only a full number carries the country code: "99 8xx xx xx" is a valid local number too.
  if (digits.startsWith('998') && digits.length >= 12) {
    digits = digits.slice(3)
  }
  digits = digits.slice(0, 9)
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
  return parts.filter(Boolean).join(' ')
}
