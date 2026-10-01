import { formatMoney, type CurrencyCode } from '@gulbahor/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { Card, Page } from '@/components/ui/page'
import { PhoneInput } from '@/components/ui/phone-input'
import { formatDateTime } from '@/lib/format'
import { useScanner } from '@/lib/scanner'

const PEOPLE: ComboOption[] = [
  { value: '1', label: "Anvar G'ofurov", hint: '+998 90 123 45 67' },
  { value: '2', label: 'Дилноза Каримова', hint: '+998 91 234 56 78' },
  { value: '3', label: "Oʻgʻiloy To‘xtayeva", hint: '+998 93 345 67 89' },
  { value: '4', label: 'Shohruh Abdullayev', hint: '+998 94 456 78 90' },
  { value: '5', label: 'Елена Ким', hint: '+998 97 567 89 01' },
]

/** A place to try every input by hand. Listed in the menu in development only. */
export function InputsDemoPage() {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<CurrencyCode>('UZS')
  const [quantity, setQuantity] = useState<number | null>(1)
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [options, setOptions] = useState(PEOPLE)
  const [person, setPerson] = useState<string | null>(null)
  const [team, setTeam] = useState<string[]>([])
  const [scan, setScan] = useState<{ code: string; at: string } | null>(null)

  useScanner((code) => setScan({ code, at: new Date().toISOString() }))

  return (
    <Page title={t('demo.title')} subtitle={t('demo.subtitle')} width="narrow">
      <Form onSubmit={() => toast.success(t('common.saved'))} className="gap-4">
        <Card title={t('demo.money')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('demo.money')} hint={t('demo.moneyHint')}>
              {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} autoFocus />}
            </Field>
            <Result>{amount === null ? '—' : `${formatMoney(amount, currency)} · ${amount} ${currency === 'UZS' ? 'tiyin' : 'sent'}`}</Result>
          </div>
        </Card>

        <Card title={t('demo.quantity')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('demo.quantity')} hint={t('demo.quantityHint')}>
              {(id) => <NumberInput id={id} value={quantity} onChange={setQuantity} suffix="dona" />}
            </Field>
            <Result>{quantity ?? '—'}</Result>
          </div>
        </Card>

        <Card title={t('demo.phone')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('demo.phone')} hint={t('demo.phoneHint')}>
              {(id) => <PhoneInput id={id} value={phone} onChange={setPhone} />}
            </Field>
            <Result>{phone || '—'}</Result>
          </div>
        </Card>

        <Card title={t('demo.date')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('demo.date')} hint={t('demo.dateHint')}>
              {(id) => <DateInput id={id} value={date} onChange={setDate} warnPast />}
            </Field>
            <Result>{date || '—'}</Result>
          </div>
        </Card>

        <Card title={t('demo.combo')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('demo.combo')} hint={t('demo.comboHint')}>
              {(id) => (
                <Combobox
                  id={id}
                  options={options}
                  value={person}
                  onChange={setPerson}
                  recentKey="demo.people"
                  onCreate={(text) => {
                    const value = String(Date.now())
                    setOptions((current) => [...current, { value, label: text }])
                    return value
                  }}
                />
              )}
            </Field>
            <Field label={`${t('demo.combo')} (${t('common.all').toLowerCase()})`}>
              {(id) => <Combobox id={id} multiple options={options} value={team} onChange={setTeam} />}
            </Field>
          </div>
        </Card>

        <Card title={t('demo.scanner')}>
          <p className="text-xs text-ink-3">{t('demo.scannerHint')}</p>
          <p className="mt-3 text-[13px]">
            {scan ? (
              <>
                <span className="text-ink-3">{t('demo.scannerLast')}: </span>
                <span className="font-code font-medium">{scan.code}</span>
                <span className="text-ink-3"> · {formatDateTime(scan.at)}</span>
              </>
            ) : (
              <span className="text-ink-3">{t('demo.scannerNone')}</span>
            )}
          </p>
        </Card>
      </Form>
    </Page>
  )
}

function Result({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-2">{t('demo.result')}</span>
      <span className="tabular flex min-h-8.5 items-center rounded-md bg-sunken px-2.5 font-code text-xs">{children}</span>
    </div>
  )
}
