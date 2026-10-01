import { LOCATION_KIND_LABELS, MODULES, setupSchema, type SetupInput } from '@gulbahor/core'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox, Select, Switch } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/features/auth/login-page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

const PLACE_KINDS = (['store', 'mixed', 'warehouse'] as const).map((kind) => ({ value: kind, label: LOCATION_KIND_LABELS[kind] }))

// Dollars are asked about on the first step, in plain words, rather than listed among the modules.
const CHOOSABLE_MODULES = MODULES.filter((module) => module.key !== 'usd')

const STEP_FIELDS: (keyof SetupInput)[][] = [['name', 'useUsd'], ['locations'], ['modules']]

/** The first-run wizard: three short steps that shape the system to the business. */
export function SetupPage() {
  const { t } = useTranslation()
  const { me } = useSession()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)

  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      name: me.org.name === 'Namuna biznes' ? '' : me.org.name,
      useUsd: true,
      locations: [{ name: '', kind: 'store' }],
      modules: [],
    },
  })
  const errors = form.formState.errors
  const places = useFieldArray({ control: form.control, name: 'locations' })
  const modules = form.watch('modules')

  const mutation = useMutation({
    mutationFn: (input: SetupInput) => api.post('/org/setup', input),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (error) => {
      if (applyServerErrors(error, form)) {
        setStep(1)
      }
    },
  })

  const advance = async () => {
    if (step < STEP_FIELDS.length - 1) {
      if (await form.trigger(STEP_FIELDS[step])) {
        setStep(step + 1)
      }
      return
    }
    await form.handleSubmit((input) => mutation.mutate(input))()
  }

  const toggleModule = (key: string, checked: boolean) => {
    const next = new Set(modules)
    if (checked) {
      next.add(key)
      MODULES.find((module) => module.key === key)?.requires?.forEach((required) => next.add(required))
    } else {
      next.delete(key)
      MODULES.filter((module) => module.requires?.includes(key)).forEach((dependent) => next.delete(dependent.key))
    }
    form.setValue('modules', [...next], { shouldDirty: true })
  }

  const steps = [t('setup.stepBusiness'), t('setup.stepPlaces'), t('setup.stepModules')]

  return (
    <AuthLayout title={t('setup.title')} subtitle={t('setup.subtitle')} wide>
      <ol className="mb-6 flex items-center gap-2">
        {steps.map((label, index) => (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                index < step && 'bg-ok-soft text-ok',
                index === step && 'bg-accent text-on-accent',
                index > step && 'bg-sunken text-ink-3',
              )}
            >
              {index < step ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={cn('truncate text-xs font-medium', index === step ? 'text-ink' : 'text-ink-3')}>{label}</span>
            {index < steps.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
          </li>
        ))}
      </ol>

      <Form onSubmit={() => void advance()}>
        {step === 0 ? (
          <>
            <Field label={t('setup.businessName')} hint={t('setup.businessNameHint')} error={errors.name?.message} required>
              {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
            </Field>
            <Controller
              control={form.control}
              name="useUsd"
              render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('setup.useUsd')} hint={t('setup.useUsdHint')} />}
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <p className="text-xs text-ink-3">{t('setup.placesHint')}</p>
            <div className="flex flex-col gap-2">
              {places.fields.map((place, index) => (
                <div key={place.id} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      autoFocus={index === places.fields.length - 1}
                      placeholder={t('setup.placeName')}
                      aria-label={t('setup.placeName')}
                      invalid={!!errors.locations?.[index]?.name}
                      {...form.register(`locations.${index}.name`)}
                    />
                    {errors.locations?.[index]?.name ? <p className="mt-1 text-xs text-bad">{errors.locations[index]?.name?.message}</p> : null}
                  </div>
                  <Controller
                    control={form.control}
                    name={`locations.${index}.kind`}
                    render={({ field }) => <Select value={field.value} onChange={field.onChange} options={PLACE_KINDS} className="w-44" />}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('common.delete')}
                    disabled={places.fields.length === 1}
                    onClick={() => places.remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            {errors.locations?.root?.message || errors.locations?.message ? (
              <p className="text-xs text-bad">{errors.locations?.root?.message ?? errors.locations?.message}</p>
            ) : null}
            <div>
              <Button size="sm" onClick={() => places.append({ name: '', kind: 'store' })}>
                <Plus />
                {t('setup.addPlace')}
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="text-xs text-ink-3">{t('setup.modulesHint')}</p>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {CHOOSABLE_MODULES.map((module) => (
                <Checkbox
                  key={module.key}
                  checked={modules.includes(module.key)}
                  onChange={(checked) => toggleModule(module.key, checked)}
                  label={module.title}
                  hint={module.description}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-2 flex items-center justify-between border-t border-line pt-4">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            {t('common.back')}
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {step === steps.length - 1 ? t('setup.done') : t('common.next')}
          </Button>
        </div>
      </Form>
    </AuthLayout>
  )
}
