import { MODULES, orgUpdateSchema, type OrgDto } from '@gulbahor/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Switch, TabPanel, Tabs } from '@/components/ui/controls'
import { Badge } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { Card, Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

const route = getRouteApi('/settings')

export function SettingsPage() {
  const { t } = useTranslation()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <Page title={t('settings.title')} width="narrow">
      <Tabs
        value={tab}
        onChange={(value) => void navigate({ search: { tab: value as typeof tab } })}
        tabs={[
          { value: 'business', label: t('settings.tabBusiness') },
          { value: 'modules', label: t('settings.tabModules') },
        ]}
      >
        <TabPanel value="business">
          <BusinessSettings />
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
  return (org: OrgDto) => queryClient.setQueryData(['me'], (me: { org: OrgDto } | undefined) => (me ? { ...me, org } : me))
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
        <Field label={t('settings.autoLock')} hint={t('settings.autoLockHint')} error={errors.settings?.autoLockMinutes?.message}>
          {(id) => (
            <Controller
              control={form.control}
              name="settings.autoLockMinutes"
              render={({ field }) => (
                <NumberInput id={id} value={field.value} onChange={field.onChange} min={0} max={240} suffix={t('settings.minutes')} className="w-40" />
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
                <MoneyInput id={id} value={field.value} onChange={field.onChange} currency="UZS" className="w-40" />
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
                <NumberInput id={id} value={field.value} onChange={field.onChange} decimals={1} max={100} suffix="%" className="w-40" />
              )}
            />
          )}
        </Field>
        {me.org.modules.includes('usd') ? (
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
                <NumberInput id={id} value={field.value} onChange={field.onChange} min={0} max={3650} suffix={t('settings.days')} className="w-40" />
              )}
            />
          )}
        </Field>
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
  const { t } = useTranslation()
  const { me } = useSession()
  const saveOrg = useSaveOrg()
  const enabled = new Set(me.org.modules)

  const mutation = useMutation({
    mutationFn: (modules: string[]) => api.put<OrgDto>('/org/modules', { modules }),
    onSuccess: (org) => saveOrg(org),
  })

  const toggle = (key: string, on: boolean) => {
    const next = new Set(enabled)
    if (on) {
      next.add(key)
      MODULES.find((module) => module.key === key)?.requires?.forEach((required) => next.add(required))
    } else {
      next.delete(key)
      // Whatever needs this module cannot stay on without it.
      MODULES.filter((module) => module.requires?.includes(key)).forEach((dependent) => next.delete(dependent.key))
    }
    mutation.mutate([...next])
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="divide-y divide-line p-0">
        {MODULES.map((module) => {
          const required = module.requires?.map((key) => MODULES.find((item) => item.key === key)?.title).filter(Boolean)
          return (
            <div key={module.key} className="px-4 py-3">
              <Switch
                checked={enabled.has(module.key)}
                onChange={(on) => toggle(module.key, on)}
                disabled={mutation.isPending}
                label={
                  <span className="flex items-center gap-2">
                    {module.title}
                    {!module.ready ? <Badge tone="warn">{t('settings.notReady')}</Badge> : null}
                  </span>
                }
                hint={
                  <>
                    {module.description}
                    {required?.length ? <span className="text-ink-2"> {t('settings.requires', { name: required.join(', ') })}.</span> : null}
                  </>
                }
              />
            </div>
          )
        })}
      </Card>
    </div>
  )
}
