import {
  LANGUAGES,
  resetPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
  type Language,
  type LocationDto,
  type RoleDto,
  type SessionDto,
  type UserDto,
} from '@gulbahor/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MonitorSmartphone } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Checkbox, Select } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, useDraft, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { formatRecent } from '@/lib/format'
import { toast } from '@/lib/toast'

import { ExtraPermissions } from './extra-permissions'
import { extrasBeyond } from './permissions'

interface Values {
  fullName: string
  phone: string
  login: string
  password: string
  roleIds: string[]
  allLocations: boolean
  locationIds: string[]
  language: Language
  extraPermissions: string[]
}

const LANGUAGE_LABELS: Record<Language, string> = { uz: 'O‘zbekcha', ru: 'Русский' }
const FORM_ID = 'user-form'

type Option = Pick<LocationDto, 'id' | 'name' | 'code' | 'kind' | 'parentId'>

export function useUserFormOptions() {
  const roles = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.get<RoleDto[]>('/roles', undefined, signal) })
  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<Option[]>('/locations/options', undefined, signal),
  })
  return { roles: roles.data ?? [], locations: locations.data ?? [] }
}

export function UserFormDialog({ user, onClose }: { user: UserDto | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { me } = useSession()
  const { roles, locations } = useUserFormOptions()

  const form = useForm<Values>({
    defaultValues: {
      fullName: user?.fullName ?? '',
      phone: user?.phone ?? '',
      login: user?.login ?? '',
      password: '',
      roleIds: user?.roles.map((role) => role.id) ?? [],
      allLocations: user?.allLocations ?? false,
      locationIds: user?.locations.map((location) => location.id) ?? [],
      language: user?.language ?? 'uz',
      extraPermissions: user?.extraPermissions ?? [],
    },
  })
  const errors = form.formState.errors
  const allLocations = form.watch('allLocations')
  const draft = useDraft(user ? null : 'user', form, ['password'])

  const mutation = useMutation({
    mutationFn: (input: unknown) => (user ? api.put(`/users/${user.id}`, input) : api.post('/users', input)),
    onSuccess: () => {
      draft.clear()
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  // What the chosen roles give already is not sent as given beside them.
  const send = <T extends { roleIds: string[]; extraPermissions: string[] }>(input: T) =>
    mutation.mutate({ ...input, extraPermissions: extrasBeyond(roles, input.roleIds, input.extraPermissions) })
  const submit = user ? zodSubmit(form, userUpdateSchema, send) : zodSubmit(form, userCreateSchema, send)

  // Only the owner may hand out the owner role.
  const roleOptions = roles
    .filter((role) => !role.isSystem || me.user.isOwner || user?.roles.some((held) => held.id === role.id))
    .map((role) => ({ value: role.id, label: role.name }))
  const locationOptions = locations.map((location) => ({ value: location.id, label: location.name, hint: location.code }))

  return (
    <Dialog
      open
      onClose={onClose}
      title={user ? t('users.edit') : t('users.add')}
      size="lg"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('users.fullName')} error={errors.fullName?.message} required>
            {(id) => <Input id={id} autoFocus invalid={!!errors.fullName} {...form.register('fullName')} />}
          </Field>
          <Field label={t('users.phone')} error={errors.phone?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => <PhoneInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.phone} />}
              />
            )}
          </Field>
          <Field label={t('users.login')} hint={t('users.loginHint')} error={errors.login?.message} required>
            {(id) => <Input id={id} autoCapitalize="none" className="lowercase" invalid={!!errors.login} {...form.register('login')} />}
          </Field>
          {user ? (
            <Field label={t('users.language')}>
              {(id) => (
                <Controller
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <Select id={id} value={field.value} onChange={field.onChange} options={LANGUAGES.map((language) => ({ value: language, label: LANGUAGE_LABELS[language] }))} />
                  )}
                />
              )}
            </Field>
          ) : (
            <Field label={t('users.password')} hint={t('users.passwordHint')} error={errors.password?.message} required>
              {(id) => <Input id={id} type="text" autoComplete="off" className="font-code" invalid={!!errors.password} {...form.register('password')} />}
            </Field>
          )}
        </div>

        <Field label={t('users.roles')} error={errors.roleIds?.message} required>
          {(id) => (
            <Controller
              control={form.control}
              name="roleIds"
              render={({ field }) => <Combobox id={id} multiple options={roleOptions} value={field.value} onChange={field.onChange} invalid={!!errors.roleIds} />}
            />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <Controller
            control={form.control}
            name="allLocations"
            render={({ field }) => <Checkbox checked={field.value} onChange={field.onChange} label={t('users.allLocations')} />}
          />
          {!allLocations ? (
            <Field label={t('users.locations')} error={errors.locationIds?.message} required>
              {(id) => (
                <Controller
                  control={form.control}
                  name="locationIds"
                  render={({ field }) => (
                    <Combobox id={id} multiple options={locationOptions} value={field.value} onChange={field.onChange} invalid={!!errors.locationIds} />
                  )}
                />
              )}
            </Field>
          ) : null}
        </div>

        <Controller
          control={form.control}
          name="extraPermissions"
          render={({ field }) => (
            <ExtraPermissions roles={roles} roleIds={form.watch('roleIds')} value={field.value} onChange={field.onChange} />
          )}
        />
      </Form>
    </Dialog>
  )
}

export function ResetPasswordDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const { t } = useTranslation()
  const form = useForm<{ password: string }>({ defaultValues: { password: '' } })
  const errors = form.formState.errors
  const formId = 'reset-password-form'

  const mutation = useMutation({
    mutationFn: (input: { password: string }) => api.post(`/users/${user.id}/password`, input),
    onSuccess: () => {
      toast.success(t('users.passwordReset'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('users.resetPassword')}: ${user.fullName}`}
      description={t('users.resetPasswordHint')}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id={formId} onSubmit={() => void zodSubmit(form, resetPasswordSchema, (input) => mutation.mutate(input))()}>
        <Field label={t('users.password')} hint={t('auth.passwordHint')} error={errors.password?.message} required>
          {(id) => <Input id={id} autoFocus autoComplete="off" className="font-code" invalid={!!errors.password} {...form.register('password')} />}
        </Field>
      </Form>
    </Dialog>
  )
}

export function UserSessionsDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const { t } = useTranslation()
  const sessions = useQuery({
    queryKey: ['users', 'sessions', user.id],
    queryFn: ({ signal }) => api.get<SessionDto[]>(`/users/${user.id}/sessions`, undefined, signal),
    staleTime: 0,
  })
  const revoke = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/users/${user.id}/sessions/${sessionId}`),
    onSuccess: () => sessions.refetch(),
  })

  return (
    <Dialog open onClose={onClose} title={`${t('users.sessions')}: ${user.fullName}`}>
      {sessions.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : sessions.data?.length ? (
        <SessionList sessions={sessions.data} onRevoke={(id) => revoke.mutate(id)} />
      ) : (
        <EmptyState icon={MonitorSmartphone} title={t('users.noSessions')} />
      )}
    </Dialog>
  )
}

export function SessionList({ sessions, onRevoke }: { sessions: SessionDto[]; onRevoke: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col">
      {sessions.map((session) => (
        <li key={session.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
          <MonitorSmartphone className="size-4 shrink-0 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[13px] font-medium">
              {session.device}
              {session.current ? <Badge tone="ok">{t('users.thisDevice')}</Badge> : null}
            </p>
            <p className="tabular text-xs text-ink-3">
              {session.ip ?? '—'} · {formatRecent(session.lastUsedAt)}
            </p>
          </div>
          {!session.current ? (
            <Button size="sm" onClick={() => onRevoke(session.id)}>
              {t('users.revoke')}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
