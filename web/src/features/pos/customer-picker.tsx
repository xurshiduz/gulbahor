import { customerInputSchema, formatMoney, type PosCustomerDto } from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { BellRing, UserRound, UserRoundPlus, X } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { controlClass, Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatPhone } from '@/lib/format'
import { toast } from '@/lib/toast'

interface CustomerPickerProps {
  registerId: string
  value: PosCustomerDto | null
  onChange: (customer: PosCustomerDto | null) => void
  /** The customer has come to pay what they owe. */
  onPayDebt?: () => void
}

export interface CustomerPickerHandle {
  focus: () => void
}

const money = (minor: number) => formatMoney(minor, 'UZS', { minor: 'auto' })

/** Digits alone are a phone being typed; anything else is a name. */
const looksLikePhone = (text: string) => /^[\d\s+()-]{3,}$/.test(text.trim())

/**
 * Who is at the counter. A few digits of their phone or a few letters of
 * their name find them; someone who is not on the books yet is written down
 * on the spot, with what was typed already in its field.
 */
export const CustomerPicker = forwardRef<CustomerPickerHandle, CustomerPickerProps>(function CustomerPicker(
  { registerId, value, onChange, onPayDebt },
  ref,
) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [adding, setAdding] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }))

  // The list is asked for a moment after the typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [text])

  const found = useQuery({
    queryKey: ['customers', 'pos', query],
    queryFn: ({ signal }) => api.get<PosCustomerDto[]>('/pos/customers', { q: query }, signal),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
  })
  const results = query.length >= 2 && text.trim() === query ? (found.data ?? []) : []
  // Below those found there is always the way to write a new one down.
  const rows = results.length + 1

  const pick = (customer: PosCustomerDto) => {
    onChange(customer)
    setText('')
    setOpen(false)
  }

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setHighlight((current) => (current + (event.key === 'ArrowDown' ? 1 : rows - 1)) % rows)
    } else if (event.key === 'Enter') {
      if (!text.trim()) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const chosen = results[highlight]
      if (chosen) {
        pick(chosen)
      } else {
        setAdding(text.trim())
      }
    } else if (event.key === 'Escape' && (open || text)) {
      event.stopPropagation()
      setText('')
      setOpen(false)
    }
  }

  if (value) {
    // A cart kept from before groups were known has a customer without them.
    const groups = value.groups ?? []
    const reminders = value.reminders ?? []
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-md border border-line bg-sunken px-2.5 py-1.5 text-[13px]">
          <UserRound className="size-4 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{value.name}</span>
            <span className="tabular block truncate text-xs text-ink-3">
              {formatPhone(value.phone)}
              {groups.length ? <span className="text-accent-ink"> · {groups.join(', ')}</span> : null}
            </span>
          </span>
          <Button
            variant="ghost"
            size="iconSm"
            tabIndex={-1}
            aria-label={t('pos.customerClear')}
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
        {/* What they owe already: said before more is lent, with the way to take it there and then. */}
        {value.debt?.owed ? (
          <p
            role="note"
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px]',
              value.debt.overdue ? 'bg-bad-soft text-bad' : 'bg-sunken text-ink-2',
            )}
          >
            <span>
              <span className="font-medium">{t('pos.customerDebt', { amount: money(value.debt.owed) })}</span>
              {value.debt.overdue ? (
                <span> · {t('pos.customerOverdue', { amount: money(value.debt.overdue) })}</span>
              ) : null}
            </span>
            {onPayDebt ? (
              <Button size="sm" tabIndex={-1} onClick={onPayDebt}>
                {t('debts.take')}
              </Button>
            ) : null}
          </p>
        ) : null}
        {/* What their groups ask the cashier to remember: it stays in sight for the whole sale. */}
        {reminders.map((reminder) => (
          <p
            key={reminder}
            role="note"
            className="flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[13px] font-medium text-warn"
          >
            <BellRing className="mt-0.5 size-3.5 shrink-0" />
            {reminder}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="relative">
      <UserRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        value={text}
        autoComplete="off"
        spellCheck={false}
        aria-label={t('pos.customer')}
        placeholder={t('pos.customerPlaceholder')}
        onChange={(event) => {
          setText(event.target.value)
          setHighlight(0)
          setOpen(true)
        }}
        onKeyDown={handleKey}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(controlClass, 'pr-14 pl-8')}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
        <Shortcut combo="mod+m" />
      </span>
      {open && text.trim().length >= 2 ? (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-float">
          {results.map((customer, index) => (
            <button
              key={customer.id}
              type="button"
              tabIndex={-1}
              data-highlighted={index === highlight}
              onMouseMove={() => setHighlight(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(customer)}
              className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1 text-left text-[13px] data-[highlighted=true]:bg-sunken"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{customer.name}</span>
              <span className="tabular shrink-0 text-xs text-ink-3">{formatPhone(customer.phone)}</span>
            </button>
          ))}
          <button
            type="button"
            tabIndex={-1}
            data-highlighted={highlight === results.length}
            onMouseMove={() => setHighlight(results.length)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setAdding(text.trim())}
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-accent-ink data-[highlighted=true]:bg-sunken"
          >
            <UserRoundPlus className="size-4" />
            {t('pos.customerAdd')}
          </button>
        </div>
      ) : null}
      {adding !== null ? (
        <NewCustomerDialog
          registerId={registerId}
          typed={adding}
          onClose={() => setAdding(null)}
          onAdded={(customer) => {
            setAdding(null)
            pick(customer)
          }}
        />
      ) : null}
    </div>
  )
})

interface NewCustomerDialogProps {
  registerId: string
  /** What was in the field: a phone, or a name. */
  typed: string
  onClose: () => void
  onAdded: (customer: PosCustomerDto) => void
}

function NewCustomerDialog({ registerId, typed, onClose, onAdded }: NewCustomerDialogProps) {
  const { t } = useTranslation()
  const phoneFirst = looksLikePhone(typed)
  const [phone, setPhone] = useState(phoneFirst ? typed : '')
  const [name, setName] = useState(phoneFirst ? '' : typed)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: unknown) => api.post<PosCustomerDto>('/pos/customers', input),
    meta: { silent: true },
    onSuccess: (customer) => {
      toast.success(t('pos.customerAdded', { name: customer.name }))
      onAdded(customer)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields)
      } else {
        toast.error(error instanceof ApiError ? error.message : String(error))
      }
    },
  })
  const submit = () => {
    const parsed = customerInputSchema.safeParse({ name, phone })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }
    setErrors({})
    save.mutate({ ...parsed.data, registerId })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('pos.customerAdd')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="pos-customer-form" variant="primary" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="pos-customer-form" onSubmit={submit}>
        <Field label={t('customers.phone')} error={errors.phone} required>
          {(id) => (
            <PhoneInput id={id} autoFocus={!phoneFirst} value={phone} onChange={setPhone} invalid={!!errors.phone} />
          )}
        </Field>
        <Field label={t('customers.name')} error={errors.name} required>
          {(id) => (
            <Input
              id={id}
              autoFocus={phoneFirst}
              value={name}
              maxLength={120}
              invalid={!!errors.name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}
