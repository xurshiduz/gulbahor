import type { Page, ProductListItemDto } from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Popover } from 'radix-ui'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ColorDot } from '@/components/ui/combobox'
import { Spinner } from '@/components/ui/feedback'
import { controlClass } from '@/components/ui/input'
import { Thumb } from '@/components/ui/thumb'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

interface ProductPickerProps {
  onPick: (product: ProductListItemDto) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Finds a model by name, article, colour, size or barcode and hands it over.
 * The catalogue can be large, so the search runs on the server; the field
 * clears after each pick, ready for the next model.
 */
export const ProductPicker = forwardRef<HTMLInputElement, ProductPickerProps>(function ProductPicker(
  { onPick, placeholder, disabled, className },
  forwardedRef,
) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => ref.current as HTMLInputElement)
  const listRef = useRef<HTMLDivElement>(null)

  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  // A moment's pause between keystrokes, so each one is not a request.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [text])

  const found = useQuery({
    queryKey: ['products', 'pick', query],
    queryFn: ({ signal }) => api.get<Page<ProductListItemDto>>('/products', { q: query, size: 12 }, signal),
    enabled: open && query.length > 0,
    placeholderData: keepPreviousData,
  })
  const items = query ? (found.data?.items ?? []) : []

  useEffect(() => setHighlight(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const pick = (product: ProductListItemDto) => {
    onPick(product)
    setText('')
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((current) => (items.length ? (current + delta + items.length) % items.length : 0))
      return
    }
    if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey) && text.trim()) {
      // Enter picks; with nothing typed it is the form's, to move on.
      event.preventDefault()
      event.stopPropagation()
      if (items[highlight] && query === text.trim()) {
        pick(items[highlight])
      }
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <Popover.Root open={open && !!text.trim()} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className={cn('relative', className)}>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
          <input
            ref={ref}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={text}
            placeholder={placeholder ?? t('products.searchPlaceholder')}
            onChange={(event) => {
              setText(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className={cn(controlClass, 'pl-8')}
          />
          {found.isFetching ? <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" /> : null}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target === ref.current) {
              event.preventDefault()
            }
          }}
          className="z-50 w-(--radix-popover-trigger-width) min-w-80 rounded-lg border border-line bg-surface p-1 shadow-float data-[state=open]:animate-pop-in"
        >
          <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto">
            {!items.length ? (
              <p className="px-2 py-3 text-center text-xs text-ink-3">
                {found.isFetching || query !== text.trim() ? t('common.loading') : t('common.nothingFound')}
              </p>
            ) : null}
            {items.map((product, index) => (
              <div
                key={product.id}
                role="option"
                aria-selected={false}
                data-highlighted={index === highlight}
                onMouseMove={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(product)}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-[13px] data-[highlighted=true]:bg-sunken"
              >
                {items.some((other) => other.image) ? <Thumb image={product.image} className="size-8" /> : null}
                <span className="font-code w-20 shrink-0 truncate text-xs text-ink-3">{product.sku}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{product.name}</span>
                  {product.brandName ? <span className="text-ink-3"> · {product.brandName}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {product.axes
                    .filter((axis) => axis.kind === 'color')
                    .flatMap((axis) => axis.values.slice(0, 6))
                    .map((value) => (value.hex ? <ColorDot key={value.id} color={value.hex} /> : null))}
                </span>
                <span className="tabular shrink-0 text-xs text-ink-3">{product.variantCount}</span>
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
})
