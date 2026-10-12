import { orgUpdateSchema, type OrgDto } from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Switch, TabPanel, Tabs } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { Card, Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { toast } from '@/lib/toast'

import { BaseCurrencyCard } from './base-currency'
import { LabelSettings } from './label-settings'
import { ModuleList, switched } from './module-list'
import { ReceiptSettings } from './receipt-settings'

const route = getRouteApi('/settings')

export function SettingsPage() {
  const { t } = useTranslation()
  const { me } = useSession()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <Page title={t('settings.title')} width={tab === 'receipt' || tab === 'label' ? undefined : 'narrow'} flow>
      <Tabs
        value={tab}
        onChange={(value) => void navigate({ search: { tab: value as typeof tab } })}
        tabs={[
          { value: 'business', label: t('settings.tabBusiness') },
          { value: 'receipt', label: t('settings.tabReceipt') },
          { value: 'label', label: t('settings.tabLabel') },
          { value: 'modules', label: t('settings.tabModules') },
        ]}
      >
        <TabPanel value="receipt">
          <ReceiptSettings />
        </TabPanel>
        <TabPanel value="label">
          <LabelSettings />
        </TabPanel>
        <TabPanel value="business">
          <div className="flex flex-col gap-3">
            <BaseCurrencyCard />
            {/* A new base sets new sums (the change step, the debt limit): the form starts again from them. */}
            <BusinessSettings key={me.org.baseCurrency} />
          </div>
        </TabPanel>
        <TabPanel value="modules">
          <ModuleSettings />
        </TabPanel>
      </Tabs>
    </Page>
  )
}

function useSaveOrg() {
  const queryClient = useQueryClient()
  return (org: OrgDto) =>
    queryClient.setQueryData(['me'], (me: { org: OrgDto } | undefined) => (me ? { ...me, org } : me))
}

function BusinessSettings() {
  const { t } = useTranslation()
  const { me } = useSession()
  const saveOrg = useSaveOrg()

  const form = useForm({
    defaultValues: {
      name: me.org.name,
      settings: {
        autoLockMinutes: me.org.settings.autoLockMinutes as number | null,
        changeRoundStep: me.org.settings.changeRoundStep as number | null,
        maxDiscountPercent: me.org.settings.maxDiscountPercent as number | null,
        maxRateLossPercent: me.org.settings.maxRateLossPercent as number | null,
        returnDays: me.org.settings.returnDays as number | null,
        debtDays: me.org.settings.debtDays as number | null,
        debtLimit: me.org.settings.debtLimit as number | null,
        receiptLineExtra: me.org.settings.receiptLineExtra,
        receiptLineSupplier: me.org.settings.receiptLineSupplier,
      },
    },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: unknown) => api.put<OrgDto>('/org', input),
    onSuccess: (org) => {
      saveOrg(org)
      form.reset({ name: org.name, settings: org.settings })
      toast.success(t('common.saved'))
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Card>
      <Form onSubmit={() => void zodSubmit(form, orgUpdateSchema, (input) => mutation.mutate(input))()}>
        <Field label={t('settings.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field
          label={t('settings.autoLock')}
          hint={t('settings.autoLockHint')}
          error={errors.settings?.autoLockMinutes?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="settings.autoLockMinutes"
              render={({ field }) => (
                <NumberInput
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  min={0}
                  max={240}
                  suffix={t('settings.minutes')}
                  className="w-40"
                />
              )}
            />
          )}
        </Field>
        <Field
          label={t('settings.changeRound')}
          hint={t('settings.changeRoundHint')}
          error={errors.settings?.changeRoundStep?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="settings.changeRoundStep"
              render={({ field }) => (
                <MoneyInput id={id} value={field.value} onChange={field.onChange} currency={base()} className="w-40" />
              )}
            />
          )}
        </Field>
        <Field
          label={t('settings.maxDiscount')}
          hint={t('settings.maxDiscountHint')}
          error={errors.settings?.maxDiscountPercent?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="settings.maxDiscountPercent"
              render={({ field }) => (
                <NumberInput
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  decimals={1}
                  max={100}
                  suffix="%"
                  className="w-40"
                />
              )}
            />
          )}
        </Field>
        {me.org.currencies.length ? (
          <Field
            label={t('settings.maxRateLoss')}
            hint={t('settings.maxRateLossHint')}
            error={errors.settings?.maxRateLossPercent?.message}
          >
            {(id) => (
              <Controller
                control={form.control}
                name="settings.maxRateLossPercent"
                render={({ field }) => (
                  <NumberInput
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    decimals={1}
                    max={100}
                    suffix="%"
                    className="w-40"
                  />
                )}
              />
            )}
          </Field>
        ) : null}
        <Field
          label={t('settings.returnDays')}
          hint={t('settings.returnDaysHint')}
          error={errors.settings?.returnDays?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="settings.returnDays"
              render={({ field }) => (
                <NumberInput
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  min={0}
                  max={3650}
                  suffix={t('settings.days')}
                  className="w-40"
                />
              )}
            />
          )}
        </Field>
        <Field
          label={t('settings.debtDays')}
          hint={t('settings.debtDaysHint')}
          error={errors.settings?.debtDays?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="settings.debtDays"
              render={({ field }) => (
                <NumberInput
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  min={1}
                  max={3650}
                  suffix={t('settings.days')}
                  className="w-40"
                />
              )}
            />
          )}
        </Field>
        <Field
          label={t('settings.debtLimit')}
          hint={t('settings.debtLimitHint')}
          error={errors.settings?.debtLimit?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="settings.debtLimit"
              render={({ field }) => (
                <MoneyInput id={id} value={field.value} onChange={field.onChange} currency={base()} className="w-40" />
              )}
            />
          )}
        </Field>
        <Controller
          control={form.control}
          name="settings.receiptLineExtra"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              label={t('settings.receiptLineExtra')}
              hint={t('settings.receiptLineExtraHint')}
            />
          )}
        />
        <Controller
          control={form.control}
          name="settings.receiptLineSupplier"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              label={t('settings.receiptLineSupplier')}
              hint={t('settings.receiptLineSupplierHint')}
            />
          )}
        />
        <div>
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={!form.formState.isDirty}>
            {t('common.save')}
          </Button>
        </div>
      </Form>
    </Card>
  )
}

function ModuleSettings() {
  const { me } = useSession()
  const saveOrg = useSaveOrg()

  const mutation = useMutation({
    mutationFn: (modules: string[]) => api.put<OrgDto>('/org/modules', { modules }),
    onSuccess: (org) => saveOrg(org),
  })

  return (
    <ModuleList
      enabled={new Set(me.org.modules)}
      onToggle={(key, on) => mutation.mutate(switched(me.org.modules, key, on))}
      busy={mutation.isPending}
    />
  )
}
