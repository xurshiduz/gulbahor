import type { CustomerDto } from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { api, ApiError } from '@/lib/api'
import { toast } from '@/lib/toast'

import { useCustomer, useCustomerChoices, useDebtText } from './choices'

/**
 * One person written down twice: the card the window was opened for goes into
 * another for good. What it owes, or is owed, goes to that other's account —
 * each currency to its own — and with it the receipts and the days debts fall
 * due. It cannot be undone, and the window says so before it is done.
 */
export function MergeDialog({ customer, onClose }: { customer: CustomerDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const debtText = useDebtText()
  const [intoId, setIntoId] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()
  const { choices, search } = useCustomerChoices([intoId])
  const kept = useCustomer(intoId).data
  const said = (balances: CustomerDto['balances']) =>
    (balances ?? [])
      .filter((item) => item.balance)
      .map((item) => debtText(item.balance, item.currency))
      .join(', ')
  const moves = said(customer.balances)

  const merge = useMutation({
    mutationFn: () => api.post<CustomerDto>(`/customers/${customer.id}/merge`, { intoId }),
    onSuccess: (into) => {
      for (const key of ['customers', 'customer-payments', 'sales', 'receipts', 'pos']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('customers.merged', { name: customer.name, into: into.name }))
      onClose()
    },
    onError: (failure) => {
      if (failure instanceof ApiError) {
        setError(failure.fields?.intoId ?? failure.message)
      }
    },
  })
  const submit = () => {
    if (!intoId) {
      toast.error(t('customers.mergePick'))
      return
    }
    setError(undefined)
    merge.mutate()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('customers.merge')} · ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="customer-merge-form" variant="primary" loading={merge.isPending}>
            {t('customers.merge')}
          </Button>
        </>
      }
    >
      <Form id="customer-merge-form" onSubmit={submit}>
        <Field
          label={t('customers.mergeInto')}
          error={error}
          hint={kept ? said(kept.balances) || undefined : undefined}
          required
        >
          {(id) => (
            <Combobox
              id={id}
              autoFocus
              options={choices
                .filter((item) => item.id !== customer.id)
                .map((item) => ({
                  value: item.id,
                  label: item.name,
                  hint: [item.isSupplier ? t('customers.supplier') : '', item.phoneTail ? `…${item.phoneTail}` : '']
                    .filter(Boolean)
                    .join(' · '),
                }))}
              onQuery={search}
              value={intoId}
              onChange={(value) => {
                setIntoId(value)
                setError(undefined)
              }}
              invalid={!!error}
            />
          )}
        </Field>
        <div data-merge-note className="flex flex-col gap-1.5 rounded-md bg-sunken p-3 text-[13px] text-ink-2">
          <p>{t('customers.mergeWhat', { name: customer.name })}</p>
          {moves ? (
            <p className="font-medium text-ink">
              {t('customers.mergeMoves')}: {moves}
            </p>
          ) : null}
        </div>
      </Form>
    </Dialog>
  )
}
