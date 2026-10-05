import {
  DEFAULT_RECEIPT_TEMPLATE,
  RECEIPT_WIDTHS,
  receiptTemplateSchema,
  type OrgDto,
  type ReceiptTemplate,
} from '@gulbahor/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select, Switch } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { useSession } from '@/features/auth/session'
import { ReceiptPaper } from '@/features/pos/receipt-paper'
import { sampleSale } from '@/features/pos/receipt-sample'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

const SWITCHES = [
  'showShop',
  'showAddress',
  'showCashier',
  'showSeller',
  'showCustomer',
  'showSku',
  'showLineDiscount',
  'showSavings',
] as const

/**
 * How the receipts look on paper. On the left the receipt as it will print,
 * changing as the switches on the right are turned; nothing is kept until it
 * is saved.
 */
export function ReceiptSettings() {
  const { t } = useTranslation()
  const { me } = useSession()
  const queryClient = useQueryClient()
  const saved: ReceiptTemplate = { ...DEFAULT_RECEIPT_TEMPLATE, ...me.org.settings.receipt }
  const [template, setTemplate] = useState<ReceiptTemplate>(saved)
  const dirty = JSON.stringify(template) !== JSON.stringify(saved)
  const set = <K extends keyof ReceiptTemplate>(key: K, value: ReceiptTemplate[K]) =>
    setTemplate((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: (input: ReceiptTemplate) => api.put<OrgDto>('/org/receipt', input),
    onSuccess: (org) => {
      queryClient.setQueryData(['me'], (current: { org: OrgDto } | undefined) =>
        current ? { ...current, org } : current,
      )
      setTemplate({ ...DEFAULT_RECEIPT_TEMPLATE, ...org.settings.receipt })
      toast.success(t('common.saved'))
    },
  })
  const submit = () => {
    const parsed = receiptTemplateSchema.safeParse(template)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('receipt.bad'))
      return
    }
    save.mutate(parsed.data)
  }

  const sample = sampleSale({
    name: t('receipt.sampleShop'),
    address: t('receipt.sampleAddress'),
    phone: '+998901234567',
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,28rem)]">
      {/* The paper: grey around it, as it lies on a counter. */}
      <div className="flex justify-center rounded-lg border border-line bg-sunken p-6">
        <div className="self-start bg-white p-[3mm] shadow-card">
          <ReceiptPaper sale={sample} template={template} orgName={me.org.name} />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('receipt.width')}>
            {(id) => (
              <Select
                id={id}
                value={String(template.width)}
                onChange={(value) => set('width', Number(value) as ReceiptTemplate['width'])}
                options={RECEIPT_WIDTHS.map((width) => ({
                  value: String(width),
                  label: t('receipt.widthMm', { width }),
                }))}
              />
            )}
          </Field>
          <Field label={t('receipt.title')} hint={t('receipt.titleHint')}>
            {(id) => (
              <Input
                id={id}
                value={template.title ?? ''}
                maxLength={60}
                placeholder={me.org.name}
                onChange={(event) => set('title', event.target.value || null)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {SWITCHES.map((key) => (
            <Switch
              key={key}
              checked={template[key]}
              onChange={(value) => set(key, value)}
              label={t(`receipt.${key}`)}
            />
          ))}
        </div>
        <Field label={t('receipt.footer')} hint={t('receipt.footerHint')}>
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              maxLength={400}
              value={template.footer ?? ''}
              onChange={(event) => set('footer', event.target.value || null)}
            />
          )}
        </Field>
        <Field label={t('receipt.socials')} hint={t('receipt.socialsHint')}>
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              maxLength={200}
              value={template.socials ?? ''}
              onChange={(event) => set('socials', event.target.value || null)}
            />
          )}
        </Field>
        <div className="flex gap-2">
          <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={submit}>
            {t('common.save')}
          </Button>
          <Button disabled={!dirty} onClick={() => setTemplate(saved)}>
            {t('receipt.revert')}
          </Button>
        </div>
      </div>
    </div>
  )
}
