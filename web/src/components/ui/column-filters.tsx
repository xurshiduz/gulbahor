import { CalendarRange, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { Button } from './button'
import { Combobox, type ComboOption } from './combobox'
import { Select, type SelectOption } from './controls'
import { DateInput } from './date-input'
import { controlClass } from './input'

/**
 * Filters that sit under a column's header (`DataTable`'s `filters`): the
 * same controls as anywhere else, only smaller, and no narrower than they
 * can be read at. The header above says what each one filters by, so they
 * carry no label of their own.
 */
const COMPACT = 'h-7 min-w-24 rounded px-2 text-xs'

interface FilterSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
}

/** A short, fixed list of choices, one of which means "all". */
export function FilterSelect({ value, onChange, options }: FilterSelectProps) {
  return <Select value={value} onChange={onChange} options={options} className={COMPACT} />
}

interface FilterComboProps {
  value: string | null
  onChange: (value: string | null) => void
  options: ComboOption[]
  /** For a filter by something its column's header does not name: a brand, under the model's name. */
  placeholder?: string
}

/** A long list picked from by typing; empty means "all". */
export function FilterCombo({ value, onChange, options, placeholder }: FilterComboProps) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? t('common.all')}
      className="min-h-7 min-w-28 rounded py-0 pr-1 pl-2 [&_input]:h-6 [&_input]:min-w-8 [&_input]:text-xs"
    />
  )
}

interface FilterDatesProps {
  from: string | undefined
  to: string | undefined
  onChange: (range: { from: string | undefined; to: string | undefined }) => void
}

const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

/** A span of days. The column is too narrow for two date fields, so they open under it. */
export function FilterDates({ from, to, onChange }: FilterDatesProps) {
  const { t } = useTranslation()
  const text =
    from && to
      ? from === to
        ? short(from)
        : `${short(from)}–${short(to)}`
      : from
        ? `${short(from)} →`
        : to
          ? `→ ${short(to)}`
          : ''

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(controlClass, COMPACT, 'flex items-center gap-1.5 text-left', !text && 'text-ink-3')}
        >
          <CalendarRange className="size-3.5 shrink-0 text-ink-3" />
          <span className="tabular min-w-0 flex-1 truncate">{text || t('common.all')}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 flex items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow-float data-[state=open]:animate-pop-in"
        >
          <DateInput
            value={from ?? ''}
            onChange={(value) => onChange({ from: value || undefined, to })}
            className="w-36"
          />
          <span className="text-xs text-ink-3">—</span>
          <DateInput
            value={to ?? ''}
            onChange={(value) => onChange({ from, to: value || undefined })}
            className="w-36"
          />
          {from || to ? (
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={t('common.clear')}
              onClick={() => onChange({ from: undefined, to: undefined })}
            >
              <X />
            </Button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
