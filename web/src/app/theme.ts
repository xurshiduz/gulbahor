import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'sepia' | 'dark' | 'system'

const STORAGE_KEY = 'gb.theme'
const CHOICES: ThemeChoice[] = ['light', 'sepia', 'dark', 'system']
const listeners = new Set<() => void>()

/** Light unless this person has chosen otherwise; following the system is a choice too. */
function read(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeChoice | null
    return stored && CHOICES.includes(stored) ? stored : 'light'
  } catch {
    return 'light'
  }
}

/** Sepia is a light theme of its own; dark is the one `dark:` styles answer to. */
function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('theme-sepia', choice === 'sepia')
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

/** The quick switch (sign-in page, Ctrl+Q): light → dark → sepia → light, whatever the system says. */
export function toggleTheme() {
  const now = document.documentElement.classList
  setTheme(now.contains('dark') ? 'sepia' : now.contains('theme-sepia') ? 'light' : 'dark')
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
