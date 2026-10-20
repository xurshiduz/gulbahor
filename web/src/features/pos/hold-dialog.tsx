import { formatMoney, holdInputSchema, type HoldDto } from '@erp/core'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { formatNumber } from '@/lib/format'
import { uuid } from '@/lib/uuid'

interface HoldDialogProps {
  registerId: string
  customer: { id: string; name: string }
  priceTypeId: string | null
  lines: { variantId: string; qty: number }[]
  /** What the cart comes to as it stands, said so that the cashier sees what is being set aside. */
  total: number
  /** Today, and the day offered: so many days on. */
  today: string
  due: string
  onClose: () => void
  /** `deposit`: the customer leaves money towards it — the payment window is opened next. */
  onDone: (hold: HoldDto, deposit: boolean) => void
}

/**
 * Setting a cart's goods aside for the customer at the counter ("Band qilish"): until which day, and a word
 * about it. The goods stay in the shop; what it changes is that nobody else is sold them. Money left towards
 * them is taken next, as an ordinary payment onto the customer's balance.
 */
export function HoldDialog({
  registerId,
  customer,
  priceTypeId,
  lines,
  total,
  today,
  due,
  onClose,
  onDone,
}: HoldDialogProps) {
  const { t } = useTranslation()
  const [dueDate, setDueDate] = useState(due)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  // One hold, one key: sent twice, it is still made once.
  const clientKey = useRef(uuid())
  const qty = lines.reduce((sum, line) => sum + Math.round(line.qty * 1000), 0) / 1000

  const save = async (deposit: boolean) => {
    const parsed = holdInputSchema.safeParse({
      clientKey: clientKey.current,
      registerId,
      customerId: customer.id,
      priceTypeId,
      lines,
      dueDate,
      note,
    })
    if (!parsed.success || dueDate < today) {
      setErrors({ dueDate: t('holds.dueBad') })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      onDone(await api.post<HoldDto>('/holds', parsed.data), deposit)
    } catch (problem) {
      const failed = problem instanceof ApiError ? problem : null
      const fields = failed?.fields ?? {}
      // What is wrong with a line — not enough of it, promised to another — is said for the whole window.
      setErrors({
        dueDate: fields.dueDate ?? '',
        form:
          Object.entries(fields).find(([key]) => key !== 'dueDate')?.[1] ?? (failed ? failed.message : String(problem)),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('holds.make')} · ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void save(true)} disabled={busy}>
            {t('holds.makeWithDeposit')}
          </Button>
          <Button type="submit" form="hold-form" variant="primary" loading={busy}>
            {t('holds.make')}
          </Button>
        </>
      }
    >
      <Form id="hold-form" onSubmit={() => void save(false)}>
        <p data-hold-goods className="text-[13px] text-ink-2">
          {t('holds.goods', { qty: formatNumber(qty), total: formatMoney(total, base()) })}
        </p>
        <Field label={t('holds.due')} error={errors.dueDate || undefined} required>
          {(id) => (
            <DateInput
              id={id}
              autoFocus
              value={dueDate}
              onChange={(value) => {
                setDueDate(value)
                setErrors({})
              }}
              min={today}
              invalid={!!errors.dueDate}
            />
          )}
        </Field>
        <Field label={t('holds.note')}>
          {(id) => <Input id={id} value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />}
        </Field>
        {errors.form ? (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {errors.form}
          </p>
        ) : null}
        <p className="rounded-md bg-sunken px-3 py-2 text-xs text-ink-3">{t('holds.makeHint')}</p>
      </Form>
    </Dialog>
  )
}
