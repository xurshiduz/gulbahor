/**
 * Prints one piece of the screen and nothing else. A copy of it is placed
 * beside the app for the time the print dialog is open; the stylesheet hides
 * everything but that copy on paper (`html.printing` in `styles/index.css`).
 */
export function printElement(source: HTMLElement) {
  const root = document.createElement('div')
  root.id = 'print-root'
  root.append(source.cloneNode(true))
  document.body.append(root)
  document.documentElement.classList.add('printing')

  const done = () => {
    window.removeEventListener('afterprint', done)
    document.documentElement.classList.remove('printing')
    root.remove()
  }
  window.addEventListener('afterprint', done)
  window.print()
}
