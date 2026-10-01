import {
  addDays,
  compareDates,
  daysInMonth,
  formatDate,
  fromIsoDate,
  parseDateInput,
  todayIn,
  toIsoDate,
  type LocalDate,
} from '@gulbahor/core'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover } from 'radix-ui'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { Button } from './button'

export interface DateInputProps {
  id?: string
  /** "2026-10-15" or "". */
  value: string
  onChange: (value: string) => void
  /** Colour the field when the date is before today: backdating deserves a second look. */
  warnPast?: boolean
  min?: string
  max?: string
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

const CALENDAR = {
  uz: {
    weekdays: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
    months: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
    placeholder: 'kk.oo.yyyy',
  },
  ru: {
    weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    placeholder: 'дд.мм.гггг',
  },
}

const calendarWords = (language: string) => (language === 'ru' ? CALENDAR.ru : CALENDAR.uz)

const display = (iso: string) => {
  const date = fromIsoDate(iso)
  return date ? formatDate(date) : ''
}

/**
 * A date you type: "b" is today, "k" yesterday, "1510" 15 October, "-3"
 * three days ago; the arrows move a day at a time. The calendar is there
 * for when you want it.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { id, value, onChange, warnPast, min, max, invalid, disabled, autoFocus, className },
  forwardedRef,
) {
  const { t, i18n } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => ref.current as HTMLInputElement)

  const [text, setText] = useState(() => display(value))
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)

  const emitted = useRef(value)
  const emit = (next: string) => {
    emitted.current = next
    if (next !== value) {
      onChange(next)
    }
  }

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value
      setText(display(value))
      setError(false)
    }
  }, [value])

  const today = todayIn()
  const selected = fromIsoDate(value)
  const isPast = warnPast && selected ? compareDates(selected, today) < 0 : false

  const within = (date: LocalDate) => {
    const iso = toIsoDate(date)
    return (!min || iso >= min) && (!max || iso <= max)
  }

  const set = (date: LocalDate) => {
    if (!within(date)) {
      setError(true)
      return
    }
    setError(false)
    setText(formatDate(date))
    emit(toIsoDate(date))
  }

  const commit = () => {
    if (!text.trim()) {
      setError(false)
      emit('')
      return
    }
    const result = parseDateInput(text, today)
    if (!result.ok) {
      setError(true)
      emit('')
      return
    }
    set(result.date)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit()
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const parsed = parseDateInput(text, today)
      const base = parsed.ok ? parsed.date : (selected ?? today)
      set(addDays(base, event.key === 'ArrowUp' ? 1 : -1))
    }
  }

  const bad = invalid || error

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <Popover.Anchor asChild>
          <div
            className={cn(
              'flex h-8.5 w-full items-center rounded-md border border-line-strong bg-surface transition-colors hover:border-control',
              'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25',
              isPast && !bad && 'border-warn bg-warn-soft focus-within:border-warn focus-within:outline-warn/25',
              bad && 'border-bad focus-within:border-bad focus-within:outline-bad/25',
              disabled && 'bg-sunken',
            )}
          >
            <input
              ref={ref}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={autoFocus}
              disabled={disabled}
              placeholder={calendarWords(i18n.language).placeholder}
              aria-invalid={bad || undefined}
              value={text}
              onChange={(event) => {
                setError(false)
                setText(event.target.value)
              }}
              onFocus={(event) => event.target.select()}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className="tabular h-full min-w-0 flex-1 bg-transparent pr-1 pl-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
            <Popover.Trigger asChild>
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                aria-label="Kalendar"
                className="mr-1 flex size-6.5 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-sunken hover:text-ink"
              >
                <CalendarDays className="size-4" />
              </button>
            </Popover.Trigger>
          </div>
        </Popover.Anchor>
        {error ? (
          <div role="alert" className="absolute top-full left-0 z-20 mt-1 rounded-md bg-bad px-2 py-1 text-xs font-medium text-white shadow-float">
            {t('input.dateInvalid')}
          </div>
        ) : isPast ? (
          <p className="mt-1 text-xs text-warn">{t('input.backdated')}</p>
        ) : null}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 rounded-lg border border-line bg-surface p-3 shadow-float data-[state=open]:animate-pop-in"
        >
          <Calendar
            selected={selected}
            today={today}
            within={within}
            onSelect={(date) => {
              set(date)
              setOpen(false)
              ref.current?.focus()
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
})

function Calendar({
  selected,
  today,
  within,
  onSelect,
}: {
  selected: LocalDate | null
  today: LocalDate
  within: (date: LocalDate) => boolean
  onSelect: (date: LocalDate) => void
}) {
  const { t, i18n } = useTranslation()
  const words = calendarWords(i18n.language)
  const [view, setView] = useState(() => ({ year: (selected ?? today).year, month: (selected ?? today).month }))

  const shift = (months: number) => {
    const total = view.year * 12 + (view.month - 1) + months
    setView({ year: Math.floor(total / 12), month: (total % 12) + 1 })
  }

  // Monday first.
  const lead = (new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay() + 6) % 7
  const days = Array.from({ length: daysInMonth(view.year, view.month) }, (_, index) => index + 1)

  return (
    <div className="w-56">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="iconSm" onClick={() => shift(-1)} aria-label={t('table.prev')}>
          <ChevronLeft />
        </Button>
        <span className="text-[13px] font-medium">
          {words.months[view.month - 1]} {view.year}
        </span>
        <Button variant="ghost" size="iconSm" onClick={() => shift(1)} aria-label={t('table.next')}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {words.weekdays.map((day) => (
          <span key={day} className="py-1 text-[10.5px] font-medium text-ink-3">
            {day}
          </span>
        ))}
        {Array.from({ length: lead }, (_, index) => (
          <span key={`lead-${index}`} />
        ))}
        {days.map((day) => {
          const date = { year: view.year, month: view.month, day }
          const isSelected = selected ? compareDates(selected, date) === 0 : false
          const isToday = compareDates(today, date) === 0
          return (
            <button
              key={day}
              type="button"
              disabled={!within(date)}
              onClick={() => onSelect(date)}
              className={cn(
                'tabular h-7 rounded text-xs transition-colors hover:bg-sunken disabled:opacity-35',
                isToday && 'font-semibold text-accent-ink',
                isSelected && 'bg-accent text-on-accent hover:bg-accent-hover',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1 border-t border-line pt-2">
        <Button size="sm" variant="ghost" className="flex-1" onClick={() => onSelect(today)}>
          {t('input.today')}
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={() => onSelect(addDays(today, -1))}>
          {t('input.yesterday')}
        </Button>
      </div>
    </div>
  )
}
