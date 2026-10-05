import { LANGUAGES, profileSchema, setPinSchema, type Language, type SessionDto } from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { setTheme, useTheme, type ThemeChoice } from '@/app/theme'
import { Button } from '@/components/ui/button'
import { Select, TabPanel, Tabs } from '@/components/ui/controls'
import { Badge, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Card, Page } from '@/components/ui/page'
import { ChangePasswordForm } from '@/features/auth/change-password-page'
import { useSession } from '@/features/auth/session'
import { SessionList } from '@/features/users/user-form'
import { api } from '@/lib/api'
import { formatPhone } from '@/lib/format'
import { toast } from '@/lib/toast'

const route = getRouteApi('/profile')

const LANGUAGE_LABELS: Record<Language, string> = { uz: "O'zbekcha", ru: 'Русский' }

export function ProfilePage() {
  const { t } = useTranslation()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <Page title={t('profile.title')} width="narrow">
      <Tabs
        value={tab}
        onChange={(value) => void navigate({ search: { tab: value as typeof tab } })}
        tabs={[
          { value: 'profile', label: t('profile.tabProfile') },
          { value: 'security', label: t('profile.tabSecurity') },
          { value: 'sessions', label: t('profile.tabSessions') },
        ]}
      >
        <TabPanel value="profile">
          <ProfileForm />
        </TabPanel>
        <TabPanel value="security">
          <div className="flex flex-col gap-4">
            <Card title={t('profile.changePassword')}>
              <ChangePasswordForm />
            </Card>
            <PinCard />
          </div>
        </TabPanel>
        <TabPanel value="sessions">
          <Sessions />
        </TabPanel>
      </Tabs>
    </Page>
  )
}

function ProfileForm() {
  const { t } = useTranslation()
  const { me } = useSession()
  const queryClient = useQueryClient()
  const theme = useTheme()

  const form = useForm({ defaultValues: { fullName: me.user.fullName, language: me.user.language } })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: unknown) => api.patch('/auth/profile', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      form.reset(form.getValues())
      toast.success(t('common.saved'))
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Card>
      <Form onSubmit={() => void zodSubmit(form, profileSchema, (input) => mutation.mutate(input))()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.fullName')} error={errors.fullName?.message} required>
            {(id) => <Input id={id} invalid={!!errors.fullName} {...form.register('fullName')} />}
          </Field>
          <Field label={t('users.login')}>{(id) => <Input id={id} value={me.user.login} disabled readOnly className="font-code" />}</Field>
          <Field label={t('users.phone')}>{(id) => <Input id={id} value={me.user.phone ? formatPhone(me.user.phone) : '—'} disabled readOnly />}</Field>
          <Field label={t('users.roles')}>
            {() => (
              <div className="flex min-h-8.5 flex-wrap items-center gap-1">
                {me.user.roles.map((role) => (
                  <Badge key={role.id}>{role.name}</Badge>
                ))}
              </div>
            )}
          </Field>
          <Field label={t('profile.language')}>
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
          <Field label={t('profile.theme')}>
            {(id) => (
              <Select
                id={id}
                value={theme}
                onChange={(value) => setTheme(value as ThemeChoice)}
                options={[
                  { value: 'system', label: t('profile.themeSystem') },
                  { value: 'light', label: t('profile.themeLight') },
                  { value: 'dark', label: t('profile.themeDark') },
                ]}
              />
            )}
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={!form.formState.isDirty}>
            {t('common.save')}
          </Button>
        </div>
      </Form>
    </Card>
  )
}

function PinCard() {
  const { t } = useTranslation()
  const { me } = useSession()
  const queryClient = useQueryClient()
  const form = useForm({ defaultValues: { password: '', pin: '' } })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: unknown) => api.post('/auth/pin', input),
    onSuccess: async () => {
      form.reset()
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.success(t('profile.pinSaved'))
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Card title={t('profile.pinTitle')}>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        {me.user.hasPin ? <Badge tone="ok">{t('profile.pinSet')}</Badge> : <Badge tone="warn">{t('profile.pinNotSet')}</Badge>}
        {t('profile.pinHint')}
      </p>
      <Form onSubmit={() => void zodSubmit(form, setPinSchema, (input) => mutation.mutate(input))()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.currentPassword')} error={errors.password?.message} required>
            {(id) => <Input id={id} type="password" autoComplete="current-password" invalid={!!errors.password} {...form.register('password')} />}
          </Field>
          <Field label={t('profile.newPin')} error={errors.pin?.message} required>
            {(id) => (
              <Input
                id={id}
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                className="tabular tracking-[0.3em]"
                invalid={!!errors.pin}
                {...form.register('pin')}
              />
            )}
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {me.user.hasPin ? t('profile.changePin') : t('profile.setPin')}
          </Button>
        </div>
      </Form>
    </Card>
  )
}

function Sessions() {
  const sessions = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: ({ signal }) => api.get<SessionDto[]>('/auth/sessions', undefined, signal),
    staleTime: 0,
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => sessions.refetch(),
  })

  return (
    <Card>
      {sessions.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <SessionList sessions={sessions.data ?? []} onRevoke={(id) => revoke.mutate(id)} />
      )}
    </Card>
  )
}
