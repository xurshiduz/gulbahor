import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'gb.theme'
const listeners = new Set<() => void>()

/** Light unless this person has chosen otherwise; following the system is a choice too. */
function read(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'system' ? stored : 'light'
  } catch {
    return 'light'
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // The theme still applies for this visit.
  }
  apply(choice)
  listeners.forEach((listener) => listener())
}

/** Flips between light and dark, whatever the system says. */
export function toggleTheme() {
  setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, read)
}

// Follow the system while the choice is "system".
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (read() === 'system') {
    apply('system')
  }
})
