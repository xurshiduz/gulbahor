import {
  debtPaymentInputSchema,
  defaultTill,
  formatMoney,
  tillsOf,
  type DebtPaymentDto,
  type PaymentAccountDto,
} from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSession } from '@/features/auth/session'
import {
  addRow,
  agreedOf,
  keepAccounts,
  keepTill,
  keptAccounts,
  lastTill,
  patchRow,
  PaymentLines,
  removeRow,
  sparePlaces,
  spreadTotal,
  startRows,
  switchTill,
  TillField,
  tillHere,
  totalOf,
  valueLines,
  type PaymentRow,
} from '@/features/partners/payment-lines'
import { api, ApiError } from '@/lib/api'
import { base, baseWords } from '@/lib/base'
import { formatPhone } from '@/lib/format'
import { toast } from '@/lib/toast'
import { useRateBook } from '@/features/money/rates'

const uuid = () => crypto.randomUUID()
const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })

interface DebtPayDialogProps {
  customer: { id: string; name: string; phone: string }
  /** What they owe now, in so'm: no more than this is taken. */
  owed: number
  onClose: () => void
  /** The money is in: whoever opened this may want to ask about the customer again. */
  onPaid?: (payment: DebtPaymentDto) => void
}

/**
 * Money a customer brings against what they owe. Where it goes is typed
 * into the rows that stand ready, the same ones a partner's payment uses;
 * which receipts it pays is not asked — the one due first is paid first.
 */
export function DebtPayDialog({ customer, owed, onClose, onPaid }: DebtPayDialogProps) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // One payment, one key: sent twice, it is still taken once.
  const [clientKey] = useState(uuid)
  const [problems, setProblems] = useState<Record<string, string>>({})

  const accounts = useQuery({
    queryKey: ['customer-debts', 'accounts'],
    queryFn: ({ signal }) => api.get<PaymentAccountDto[]>('/customer-debts/accounts', undefined, signal),
  })
  // The day's rates, all of them: a line may be in any currency the business keeps.
  const dayRate = useRateBook()
  const places = useMemo(() => accounts.data ?? [], [accounts.data])

  // The till the money goes into: the one picked here, else the one that stands to reason.
  const tills = useMemo(() => tillsOf(places), [places])
  const [pickedTill, setPickedTill] = useState<string | null>(null)
  const tillId = tills.some((till) => till.id === pickedTill) ? pickedTill : defaultTill(tills, tillHere(), lastTill())
  const shown = useMemo(() => rows ?? startRows(places, keptAccounts(), tillId), [rows, places, tillId])
  const pickTill = (id: string) => {
    setPickedTill(id)
    keepTill(id)
    setRows(switchTill(shown, places, id))
  }
  // A debt is in so'm: dollars are worth what the rate makes them.
  const valued = valueLines(shown, places, me.org.baseCurrency, dayRate, me.org.settings.maxRateLossPercent)
  const total = totalOf(valued)
  const noRate = valued.some((line) => line.changes && !line.rate && line.row.amount)

  const patch = (accountId: string, change: Partial<PaymentRow>) => {
    setRows(patchRow(shown, accountId, change))
    setProblems((current) => {
      if (!(accountId in current)) {
        return current
      }
      const { [accountId]: _fixed, ...rest } = current
      return rest
    })
  }
  const lay = (next: PaymentRow[]) => {
    setRows(next)
    keepAccounts(next)
  }

  const save = useMutation({
    mutationFn: ({ input }: { input: unknown; keys: string[] }) =>
      api.post<DebtPaymentDto>('/customer-debts/payments', input),
    meta: { silent: true },
    onSuccess: (payment) => {
      for (const key of ['customer-debts', 'customers', 'money', 'pos', 'shifts']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('debts.paid', { number: payment.number, amount: money(payment.total) }))
      onPaid?.(payment)
      onClose()
    },
    onError: (error, { keys }) => {
      if (!(error instanceof ApiError)) {
        toast.error(String(error))
        return
      }
      if (error.code === 'RATE_CHANGED') {
        void queryClient.invalidateQueries({ queryKey: ['money'] })
      }
      const found: Record<string, string> = {}
      const other: string[] = []
      for (const [path, message] of Object.entries(error.fields ?? {})) {
        const index = /^lines\.(\d+)\./.exec(path)?.[1]
        const key = index === undefined ? undefined : keys[Number(index)]
        if (key) {
          found[key] = message
        } else {
          other.push(message)
        }
      }
      setProblems(found)
      if (!Object.keys(found).length) {
        toast.error(other[0] ?? error.message)
      }
    },
  })

  const submit = () => {
    const filled = valued.filter((line) => line.row.amount)
    if (!filled.length) {
      toast.error(t('payments.nothing'))
      return
    }
    if (noRate) {
      toast.error(t('payments.noRate'))
      return
    }
    if (total > owed) {
      toast.error(t('debts.tooMuch', { amount: money(owed) }))
      return
    }
    const parsed = debtPaymentInputSchema.safeParse({
      clientKey,
      customerId: customer.id,
      lines: filled.map((line) => ({
        accountId: line.row.accountId,
        amount: line.row.amount,
        settled: agreedOf(line),
      })),
      total,
      note,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('payments.nothing'))
      return
    }
    save.mutate({ input: parsed.data, keys: filled.map((line) => line.row.accountId) })
  }

  const typeTotal = (wanted: number) => {
    const taken = spreadTotal(valued, wanted, base())
    if (!taken) {
      toast.error(t(valued.some((line) => line.account.open) ? 'payments.totalTooSmall' : 'payments.pickAccount'))
      return false
    }
    patch(taken.accountId, { amount: taken.amount, settled: null })
    return true
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={t('debts.payTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="debt-pay-form" variant="primary" loading={save.isPending}>
            {t('debts.take')}
          </Button>
        </>
      }
    >
      <Form id="debt-pay-form" onSubmit={submit}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{customer.name}</p>
            <p className="tabular text-xs text-ink-3">{formatPhone(customer.phone)}</p>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right text-[13px] leading-tight">
              <p className="text-xs text-ink-3">{t('debts.owes')}</p>
              <p className="tabular font-semibold">{money(owed)}</p>
            </div>
            <div className="w-56 empty:hidden">
              <TillField tills={tills} value={tillId} onChange={pickTill} />
            </div>
          </div>
        </div>

        {accounts.data && !places.length ? (
          <p className="text-[13px] text-ink-3">{t('payments.noAccounts')}</p>
        ) : (
          <PaymentLines
            kind="in"
            lines={valued}
            spare={sparePlaces(places, shown)}
            currency={base()}
            owed={owed > 0 ? owed : null}
            onPatch={patch}
            onAdd={(accountId) => {
              lay(addRow(shown, accountId))
              setAdded(accountId)
            }}
            onRemove={(accountId) => lay(removeRow(shown, accountId))}
            onTotal={typeTotal}
            setsRates={can('money.rates')}
            dayRate={dayRate}
            problems={problems}
            autoFocus
            focusId={added}
            headings={{ ours: t('ops.cameIn'), theirs: t('ops.inBase', baseWords(t)) }}
          />
        )}

        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}
