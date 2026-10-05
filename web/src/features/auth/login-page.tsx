import { loginSchema, type LoginInput } from '@gulbahor/core'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Moon, Sun } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { toggleTheme } from '@/app/theme'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { setLanguage } from '@/i18n'
import { api, ApiError } from '@/lib/api'

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation()
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { login: '', password: '' } })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: LoginInput) => api.post('/auth/login', input),
    onSuccess: onSignedIn,
    onError: (error) => {
      if (!applyServerErrors(error, form) && error instanceof ApiError) {
        form.setError('password', { message: error.message })
        form.setFocus('password')
      }
    },
    meta: { silent: true },
  })

  useEffect(() => {
    document.title = `${t('auth.title')} · Gulbahor`
  }, [t])

  return (
    <AuthLayout title={t('auth.title')} subtitle={t('auth.subtitle')}>
      <Form onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <Field label={t('auth.login')} error={errors.login?.message}>
          {(id) => <Input id={id} autoFocus autoCapitalize="none" autoComplete="username" invalid={!!errors.login} {...form.register('login')} />}
        </Field>
        <Field label={t('auth.password')} error={errors.password?.message}>
          {(id) => <PasswordInput id={id} autoComplete="current-password" invalid={!!errors.password} {...form.register('password')} />}
        </Field>
        <Button type="submit" variant="primary" loading={mutation.isPending} className="mt-1 h-10">
          {t('auth.signIn')}
        </Button>
      </Form>
    </AuthLayout>
  )
}

/** The frame shared by the screens shown before the app itself: sign-in, first password, setup. */
export function AuthLayout({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  const { i18n } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-5">
      <div className="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" className="size-8" />
        <span className="text-lg font-semibold tracking-tight">Gulbahor</span>
      </div>
      <div className={`w-full rounded-xl border border-line bg-surface p-6 shadow-card ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
        <h1 className="text-base font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 mb-5 text-xs text-ink-3">{subtitle}</p> : <div className="mb-5" />}
        {children}
      </div>
      <div className="flex items-center gap-1 text-xs text-ink-3">
        {(['uz', 'ru'] as const).map((language) => (
          <button
            key={language}
            type="button"
            onClick={() => setLanguage(language)}
            className={`rounded px-2 py-1 hover:bg-sunken ${i18n.language === language ? 'font-semibold text-ink' : ''}`}
          >
            {language === 'uz' ? "O'zbekcha" : 'Русский'}
          </button>
        ))}
        <button type="button" onClick={toggleTheme} aria-label="Theme" className="ml-1 rounded p-1.5 hover:bg-sunken">
          <Sun className="hidden size-4 dark:block" />
          <Moon className="size-4 dark:hidden" />
        </button>
      </div>
    </div>
  )
}
