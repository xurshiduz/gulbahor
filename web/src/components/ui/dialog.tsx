import { X } from 'lucide-react'
import { Dialog as Primitive } from 'radix-ui'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { Button } from './button'
import { PageBarBoundary } from './page'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Ask before closing: there is unsaved work inside. */
  dirty?: boolean
  children: ReactNode
  footer?: ReactNode
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }

export function Dialog({ open, onClose, title, description, size = 'md', dirty, children, footer }: DialogProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  const requestClose = async () => {
    if (dirty && !(await confirm({ title: t('common.unsaved'), confirmLabel: t('common.close'), tone: 'danger' }))) {
      return
    }
    onClose()
  }

  return (
    <Primitive.Root open={open} onOpenChange={(next) => !next && void requestClose()}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in" />
        <Primitive.Content
          className={cn(
            'fixed top-[8vh] left-1/2 z-40 flex max-h-[84vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col',
            'rounded-xl border border-line bg-surface shadow-float outline-none data-[state=open]:animate-pop-in',
            SIZES[size],
          )}
          onKeyDown={(event) => {
            // Ctrl+Enter saves from anywhere in the dialog; inside the form, the form has already taken it.
            if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.defaultPrevented) {
              return
            }
            const submit = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)')
            if (submit) {
              event.preventDefault()
              submit.click()
            }
          }}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <Primitive.Title className="text-[15px] font-semibold text-ink">{title}</Primitive.Title>
              {description ? (
                <Primitive.Description className="mt-0.5 text-xs text-ink-3">{description}</Primitive.Description>
              ) : (
                <Primitive.Description className="sr-only">{title}</Primitive.Description>
              )}
            </div>
            <Primitive.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label={t('common.close')} className="-mr-1.5">
                <X />
              </Button>
            </Primitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <PageBarBoundary>{children}</PageBarBoundary>
          </div>
          {footer ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
          ) : null}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}

// ───────────────────────────── Confirm ─────────────────────────────

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  tone?: 'default' | 'danger'
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false))

/** `if (await confirm({ title }))` — a yes/no question that reads like one line of code. */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Primitive.Root open={!!options} onOpenChange={(next) => !next && settle(false)}>
        <Primitive.Portal>
          <Primitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
          <Primitive.Content
            className="fixed top-[22vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-line bg-surface p-5 shadow-float outline-none data-[state=open]:animate-pop-in"
            onOpenAutoFocus={(event) => {
              // Enter should confirm, so the confirm button takes the focus.
              event.preventDefault()
              ;(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm]')?.focus()
            }}
          >
            <Primitive.Title className="text-sm font-semibold text-ink">{options?.title}</Primitive.Title>
            <Primitive.Description className={cn('mt-1.5 text-[13px] text-ink-2', !options?.description && 'sr-only')}>
              {options?.description ?? options?.title}
            </Primitive.Description>
            <div className="mt-5 flex justify-end gap-2">
              {/* Every confirm is a yes/no question, and "cancel" would read as the action when cancelling a document. */}
              <Button onClick={() => settle(false)}>{t('common.no')}</Button>
              <Button
                data-confirm
                variant={options?.tone === 'danger' ? 'danger' : 'primary'}
                onClick={() => settle(true)}
              >
                {options?.confirmLabel ?? t('common.confirm')}
              </Button>
            </div>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </ConfirmContext.Provider>
  )
}
