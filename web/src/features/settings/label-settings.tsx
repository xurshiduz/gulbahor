import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_LABEL_TEMPLATE,
  formatMoney,
  LABEL_SIZE_KEYS,
  LABEL_TEXT_SIZES,
  labelTemplateSchema,
  type LabelData,
  type LabelSizeKey,
  type LabelTemplate,
  type LabelTextSize,
  type OrgDto,
} from '@gulbahor/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select, Switch } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { useSession } from '@/features/auth/session'
import { LabelPreview } from '@/features/labels/label-preview'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

const SWITCHES = ['showName', 'showDetails', 'showBarcode', 'showSku', 'showTag', 'bigPrice'] as const

/**
 * What goes on the labels. On the left a label as it will print, changing
 * as the switches on the right are turned; nothing is kept until it is
 * saved. The size and the price are not the template's: they are chosen
 * when printing, and here only to see the label with and without.
 */
export function LabelSettings() {
  const { t } = useTranslation()
  const { me, hasModule } = useSession()
  const queryClient = useQueryClient()
  const saved: LabelTemplate = { ...DEFAULT_LABEL_TEMPLATE, ...me.org.settings.label }
  const [template, setTemplate] = useState<LabelTemplate>(saved)
  const [size, setSize] = useState<LabelSizeKey>(DEFAULT_LABEL_SIZE)
  const [priced, setPriced] = useState(true)
  const [tagged, setTagged] = useState(hasModule('rfid'))
  const dirty = JSON.stringify(template) !== JSON.stringify(saved)
  const set = <K extends keyof LabelTemplate>(key: K, value: LabelTemplate[K]) =>
    setTemplate((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: (input: LabelTemplate) => api.put<OrgDto>('/org/label', input),
    onSuccess: (org) => {
      queryClient.setQueryData(['me'], (current: { org: OrgDto } | undefined) =>
        current ? { ...current, org } : current,
      )
      setTemplate({ ...DEFAULT_LABEL_TEMPLATE, ...org.settings.label })
      toast.success(t('common.saved'))
    },
  })
  const submit = () => {
    const parsed = labelTemplateSchema.safeParse(template)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('receipt.bad'))
      return
    }
    save.mutate(parsed.data)
  }

  const sample: LabelData = {
    name: t('labelTemplate.sampleName'),
    details: t('labelTemplate.sampleDetails'),
    sku: '8018-08',
    barcode: '2000000000015',
    // A label is printed with ordinary spaces, whatever the screen keeps thousands apart with.
    price: priced ? formatMoney(910_000_00, 'UZS', { minor: 'auto' }).replace(/\s/g, ' ') : null,
    epc: tagged ? '47554C00000000000000002A' : null,
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,28rem)]">
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-sunken p-6">
        <div className="flex min-h-64 flex-1 items-center justify-center">
          <LabelPreview label={sample} format={{ size, dpi: 203 }} template={template} />
        </div>
        {/* How it is printed, not how it is set: to see the same template on another roll, with or without a price. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
          <Select
            className="w-32"
            value={size}
            onChange={(value) => setSize(value as LabelSizeKey)}
            options={LABEL_SIZE_KEYS.map((key) => ({ value: key, label: `${key.replace('x', ' × ')} mm` }))}
          />
          <Switch checked={priced} onChange={setPriced} label={t('labels.withPrice')} />
          {hasModule('rfid') ? <Switch checked={tagged} onChange={setTagged} label="RFID" /> : null}
          <span className="text-xs text-ink-3">{t('labelTemplate.previewHint')}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 self-start rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {SWITCHES.map((key) => (
            <Switch
              key={key}
              checked={template[key]}
              onChange={(value) => set(key, value)}
              label={t(`labelTemplate.${key}`)}
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('labelTemplate.nameLines')}>
            {(id) => (
              <Select
                id={id}
                value={String(template.nameLines)}
                disabled={!template.showName}
                onChange={(value) => set('nameLines', Number(value) as LabelTemplate['nameLines'])}
                options={[
                  { value: '1', label: t('labelTemplate.nameOneLine') },
                  { value: '2', label: t('labelTemplate.nameTwoLines') },
                ]}
              />
            )}
          </Field>
          <Field label={t('labelTemplate.text')}>
            {(id) => (
              <Select
                id={id}
                value={template.text}
                onChange={(value) => set('text', value as LabelTextSize)}
                options={LABEL_TEXT_SIZES.map((value) => ({ value, label: t(`labelTemplate.text_${value}`) }))}
              />
            )}
          </Field>
        </div>
        <p className="text-xs text-ink-3">{t('labelTemplate.hint')}</p>
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
