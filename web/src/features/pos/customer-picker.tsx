import {
  CUSTOMER_GENDER_LABELS,
  CUSTOMER_GENDERS,
  customerInputSchema,
  formatMoney,
  type AnyCurrency,
  type CustomerGender,
  type PosCustomerDto,
} from '@erp/core'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { BellRing, UserRound, UserRoundPlus, X } from 'lucide-react'
import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Select } from '@/components/ui/controls'
import { DateInput } from '@/components/ui/date-input'
import { controlClass, Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Balance } from '@/features/customers/balance'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { cn } from '@/lib/cn'
import { formatPhone } from '@/lib/format'
import { toast } from '@/lib/toast'

interface CustomerPickerProps {
  registerId: string
  value: PosCustomerDto | null
  onChange: (customer: PosCustomerDto | null) => void
  /** The customer has come to pay what they owe. */
  onPayDebt?: () => void
  /** The customer asks for what is theirs on the account back: offered where someone here may hand it over. */
  onHandBack?: () => void
  /** Who keeps the customer book writes the whole card here; a cashier, the name and what is safe to give. */
  keepsBook?: boolean
}

export interface CustomerPickerHandle {
  focus: () => void
}

const money = (minor: number, currency: AnyCurrency = base()) => formatMoney(minor, currency, { minor: 'auto' })

/** Digits alone are a phone being typed; anything else is a name. */
const looksLikePhone = (text: string) => /^[\d\s+()-]{3,}$/.test(text.trim())

/**
 * Who is at the counter. A few digits of their phone or a few letters of
 * their name find them; someone who is not on the books yet is written down
 * on the spot, with what was typed already in its field.
 */
export const CustomerPicker = forwardRef<CustomerPickerHandle, CustomerPickerProps>(function CustomerPicker(
  { registerId, value, onChange, onPayDebt, onHandBack, keepsBook = false },
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
  const asked = query.length >= 2 && text.trim() === query
  const results = asked ? (found.data ?? []) : []
  // Below those found there is always the way to write a new one down.
  const rows = results.length + 1
  const adds = results.length

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
    // What stands on their accounts: none for a cart kept from before accounts were known, nor for a supplier.
    const standing = (value.accounts ?? []).filter((account) => account.balance)
    const owes = standing.some((account) => account.balance > 0)
    const late = standing.some((account) => account.overdue > 0)
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-md border border-line bg-sunken px-2.5 py-1.5 text-[13px]">
          <UserRound className="size-4 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium" title={value.name}>
              {value.name}
            </span>
            {value.phone ? (
              <span className="tabular block truncate text-xs text-ink-3">{formatPhone(value.phone)}</span>
            ) : null}
            {/* A group's name is said whole, however long: it may be what the cashier must keep in mind. */}
            {groups.length ? (
              <span className="mt-0.5 flex flex-wrap gap-1">
                {groups.map((group) => (
                  <span
                    key={group}
                    data-customer-group
                    className="rounded bg-accent-soft px-1.5 text-[11px] leading-4 break-words text-accent-ink"
                  >
                    {group}
                  </span>
                ))}
              </span>
            ) : null}
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
        {/* What they owe already, or what is theirs to spend: said before more goes on the account, with the
            way to take money there and then. */}
        {standing.length ? (
          <div
            role="note"
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px]',
              late ? 'bg-bad-soft text-bad' : 'bg-sunken text-ink-2',
            )}
          >
            <span className="flex flex-col">
              {standing.map((account) => (
                <span key={account.currency}>
                  {t('pos.balanceOf')}:{' '}
                  <Balance balance={account.balance} currency={account.currency} className="font-medium" />
                  {account.overdue ? (
                    <span> · {t('pos.customerOverdue', { amount: money(account.overdue, account.currency) })}</span>
                  ) : null}
                </span>
              ))}
            </span>
            {onPayDebt && owes ? (
              <Button size="sm" tabIndex={-1} onClick={onPayDebt}>
                {t('debts.take')}
              </Button>
            ) : onHandBack && standing.some((account) => account.balance < 0) ? (
              <Button size="sm" tabIndex={-1} onClick={onHandBack}>
                {t('pos.handBack')}
              </Button>
            ) : null}
          </div>
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
              <span className="min-w-0 flex-1 truncate font-medium" title={customer.name}>
                {customer.name}
              </span>
              {customer.phone ? (
                <span className="tabular shrink-0 text-xs text-ink-3">{formatPhone(customer.phone)}</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            tabIndex={-1}
            data-highlighted={highlight === adds}
            onMouseMove={() => setHighlight(adds)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setAdding(text.trim())}
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-accent-ink data-[highlighted=true]:bg-sunken"
          >
            <UserRoundPlus className="size-4" />
            {t('pos.customerAdd')}
          </button>
        </div>
      ) : null}
      {adding !== null && keepsBook ? (
        <Suspense fallback={null}>
          <BookCustomerDialog
            initial={looksLikePhone(adding) ? { phone: adding } : { name: adding }}
            onClose={() => setAdding(null)}
            onAdded={(customer) => {
              setAdding(null)
              pick(customer)
            }}
          />
        </Suspense>
      ) : adding !== null ? (
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

// The customer book's own form, loaded when someone who keeps the book adds a customer at the till.
const BookCustomerDialog = lazy(() => import('./book-customer-dialog'))

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
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<CustomerGender | ''>('')
  const [note, setNote] = useState('')
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
    const parsed = customerInputSchema.safeParse({
      name,
      phone,
      birthday: birthday || null,
      gender: gender || null,
      note,
    })
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
        <Field label={t('customers.phone')} error={errors.phone}>
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
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('customers.birthday')} error={errors.birthday}>
            {(id) => <DateInput id={id} value={birthday} onChange={setBirthday} />}
          </Field>
          <Field label={t('customers.gender')} error={errors.gender}>
            {(id) => (
              <Select
                id={id}
                value={gender || 'none'}
                onChange={(value) => setGender(value === 'none' ? '' : (value as CustomerGender))}
                options={[
                  { value: 'none', label: t('customers.genderNone') },
                  ...CUSTOMER_GENDERS.map((value) => ({ value, label: CUSTOMER_GENDER_LABELS[value] })),
                ]}
              />
            )}
          </Field>
        </div>
        <Field label={t('customers.note')} error={errors.note}>
          {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}
