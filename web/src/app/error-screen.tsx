import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

/** A part of the program the browser no longer has: a new version was put up since the page was opened. */
const stale = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(
    String((error as Error)?.message ?? error),
  )

const RELOADED = 'gb.reloaded-for-update'

/** After a new version, the page is opened afresh once by itself; a second time it says so instead of looping. */
function reloadOnceFor(error: unknown): boolean {
  if (!stale(error)) {
    return false
  }
  try {
    if (sessionStorage.getItem(RELOADED)) {
      return false
    }
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    return false
  }
  window.location.reload()
  return true
}

function Screen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  const message = String((error as Error)?.message ?? error)
  return (
    <div className="flex h-full min-h-64 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-bad-soft text-bad">
          <TriangleAlert className="size-6" />
        </div>
        <p className="text-base font-semibold text-ink">
          {stale(error) ? t('errorScreen.updated') : t('errorScreen.title')}
        </p>
        <p className="text-sm text-ink-2">{stale(error) ? t('errorScreen.updatedHint') : t('errorScreen.hint')}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onRetry}>
            <RotateCcw />
            {t('errorScreen.retry')}
          </Button>
          <Button onClick={() => window.location.assign('/')}>{t('errorScreen.home')}</Button>
        </div>
        <details className="mt-2 w-full text-left text-xs text-ink-3">
          <summary className="cursor-pointer text-center hover:text-ink-2">{t('errorScreen.details')}</summary>
          <pre className="font-code mt-2 max-h-40 overflow-auto rounded-md border border-line bg-sunken p-2 whitespace-pre-wrap">
            {message}
          </pre>
        </details>
      </div>
    </div>
  )
}

/** What a page that broke shows in its place: the menu and the top bar stay, the rest of the program keeps working. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  if (reloadOnceFor(error)) {
    return null
  }
  return (
    <Screen
      error={error}
      onRetry={() => {
        reset()
        void router.invalidate()
      }}
    />
  )
}

/** The last net, for what breaks outside any page (the sign-in, the frame itself). */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    reloadOnceFor(error)
  }

  render() {
    return this.state.error ? (
      <div className="h-full bg-canvas">
        <Screen error={this.state.error} onRetry={() => window.location.reload()} />
      </div>
    ) : (
      this.props.children
    )
  }
}
