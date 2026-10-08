import { LOCATION_KIND_LABELS, LOCATION_KINDS, locationInputSchema, type LocationDto, type LocationInput, type LocationKind } from '@erp/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, useDraft, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

interface Values {
  name: string
  kind: LocationKind
  code: string
  parentId: string | null
  address: string
  phone: string
}

const KIND_OPTIONS = LOCATION_KINDS.map((kind) => ({ value: kind, label: LOCATION_KIND_LABELS[kind] }))

const FORM_ID = 'location-form'

interface Props {
  /** The place being edited, or null for a new one. */
  location: LocationDto | null
  onClose: () => void
}

export function LocationFormDialog({ location, onClose }: Props) {
  const { t } = useTranslation()
  const form = useForm<Values>({
    defaultValues: {
      name: location?.name ?? '',
      kind: location?.kind ?? 'store',
      code: location?.code ?? '',
      parentId: location?.parentId ?? null,
      address: location?.address ?? '',
      phone: location?.phone ?? '',
    },
  })
  const errors = form.formState.errors
  const kind = form.watch('kind')
  const draft = useDraft(location ? null : 'location', form)

  // A zone sits inside a shop, so the shops are needed to pick from.
  const shops = useQuery({
    queryKey: ['locations', 'shops'],
    queryFn: ({ signal }) => api.get<{ items: LocationDto[] }>('/locations', { size: 200, status: 'active' }, signal),
    enabled: kind === 'zone',
  })
  const shopOptions = (shops.data?.items ?? [])
    .filter((item) => (item.kind === 'store' || item.kind === 'mixed') && item.id !== location?.id)
    .map((item) => ({ value: item.id, label: item.name, hint: item.code }))

  const mutation = useMutation({
    mutationFn: (input: LocationInput) => (location ? api.put(`/locations/${location.id}`, input) : api.post('/locations', input)),
    onSuccess: () => {
      draft.clear()
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  const submit = zodSubmit(form, locationInputSchema, (input) => mutation.mutate(input))

  return (
    <Dialog
      open
      onClose={onClose}
      title={location ? t('locations.edit') : t('locations.add')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id={FORM_ID} onSubmit={() => void submit()}>
        <Field label={t('locations.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('locations.kind')} error={errors.kind?.message} required>
            {(id) => (
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value)
                      if (value !== 'zone') {
                        form.setValue('parentId', null)
                      }
                    }}
                    // A zone stays a zone and a shop never becomes one, so those choices are not offered.
                    options={location && location.kind !== 'zone' ? KIND_OPTIONS.filter((option) => option.value !== 'zone') : KIND_OPTIONS}
                    disabled={location?.kind === 'zone'}
                  />
                )}
              />
            )}
          </Field>
          <Field label={t('locations.code')} hint={t('locations.codeHint')} error={errors.code?.message}>
            {(id) => <Input id={id} className="font-code uppercase" maxLength={8} invalid={!!errors.code} {...form.register('code')} />}
          </Field>
        </div>
        {kind === 'zone' ? (
          <Field label={t('locations.parent')} error={errors.parentId?.message} required>
            {(id) => (
              <Controller
                control={form.control}
                name="parentId"
                render={({ field }) => <Combobox id={id} options={shopOptions} value={field.value} onChange={field.onChange} invalid={!!errors.parentId} />}
              />
            )}
          </Field>
        ) : null}
        <Field label={t('locations.address')} error={errors.address?.message}>
          {(id) => <Input id={id} invalid={!!errors.address} {...form.register('address')} />}
        </Field>
        <Field label={t('locations.phone')} error={errors.phone?.message}>
          {(id) => (
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => <PhoneInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.phone} />}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}
