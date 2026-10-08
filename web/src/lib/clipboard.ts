/**
 * Puts text on the clipboard. `navigator.clipboard` exists only on https and
 * localhost; on the shop computer's local-network address the older way is
 * used. The helper field goes next to the focused button, so an open
 * dialog's focus trap does not pull the selection away.
 */
export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.readOnly = true
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.opacity = '0'
  ;(before?.parentElement ?? document.body).append(area)
  area.select()
  // Old, but the only way without https.
  const done = document.execCommand('copy')
  area.remove()
  before?.focus()
  if (!done) {
    throw new Error('The clipboard refused the text')
  }
}
