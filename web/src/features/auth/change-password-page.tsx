import { changePasswordSchema, type ChangePasswordInput } from '@erp/core'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form } from '@/components/ui/form'
import { PasswordInput } from '@/components/ui/password-input'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

import { AuthLayout } from './login-page'
import { useSession } from './session'

/** Shown instead of the app while a person still has the password a manager gave them. */
export function ChangePasswordPage() {
  const { t } = useTranslation()
  const { logout } = useSession()
  return (
    <AuthLayout title={t('auth.changeTitle')} subtitle={t('auth.changeHint')}>
      <ChangePasswordForm />
      <button type="button" className="mt-4 w-full text-center text-xs text-ink-3 hover:text-ink hover:underline" onClick={() => void logout()}>
        {t('auth.signOut')}
      </button>
    </AuthLayout>
  )
}

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema), defaultValues: { current: '', next: '' } })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post('/auth/password', input),
    onSuccess: async () => {
      toast.success(t('auth.passwordChanged'))
      form.reset()
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      onDone?.()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Form onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
      <Field label={t('auth.currentPassword')} error={errors.current?.message}>
        {(id) => <PasswordInput id={id} autoFocus autoComplete="current-password" invalid={!!errors.current} {...form.register('current')} />}
      </Field>
      <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} error={errors.next?.message}>
        {(id) => <PasswordInput id={id} autoComplete="new-password" invalid={!!errors.next} {...form.register('next')} />}
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </Form>
  )
}
