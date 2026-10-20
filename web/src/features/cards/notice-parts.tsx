import {
  formatMoney,
  parsePhone,
  telegramLoginCodeSchema,
  telegramLoginPasswordSchema,
  telegramLoginStartSchema,
  type CardDocumentRef,
  type CardNoticeDto,
  type TelegramAccountDto,
  type TelegramCodeWay,
  type TelegramLoginReady,
  type TelegramLoginStep,
} from '@erp/core'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Segments } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { QrCode } from '@/components/ui/qr-code'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

/** The bank's own clock as it wrote it ("2026-10-12T10:20"), the way a day is written here: "12.10.2026 10:20". */
export function bankClock(at: string): string {
  const [day, time] = at.split('T')
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year} ${time}`
}

/** Which card a notice is of: the business's name for it, or — a card it does not keep — its last digits. */
export const noticeCard = (notice: Pick<CardNoticeDto, 'accountName' | 'cardTail'>) =>
  notice.accountName ?? (notice.cardTail ? `*${notice.cardTail}` : '')

/** What moved: green with a plus for what came, red with a minus for what went. Nothing for a notice with no sum. */
export function NoticeSum({ notice }: { notice: CardNoticeDto }) {
  if (notice.kind !== 'move' || notice.amount === null || !notice.currency) {
    return null
  }
  const came = notice.direction === 'in'
  return (
    <span data-direction={notice.direction} className={cn('tabular font-medium', came ? 'text-ok' : 'text-bad')}>
      {came ? '+' : '−'}
      {formatMoney(notice.amount, notice.currency)}
    </span>
  )
}

type Step = 'qr' | 'phone' | 'code' | 'password'
/** How a sign-in begins: a QR code scanned from the account's own app, or its number and the code sent to it. */
type Way = 'qr' | 'phone'

/**
 * Signing a Telegram account in. The first way offered asks for nothing to be typed: a QR code the account's
 * own Telegram app scans — whoever holds the telephone with the banks' bots on it is the account. The other is
 * the number and the code Telegram sends to the account's own app. Either way an account with a two-step
 * password is asked for it; what is typed goes to Telegram and is kept nowhere.
 */
export function TelegramConnectDialog({
  onClose,
  onDone,
  start = 'qr',
  pollMs = 2_000,
}: {
  onClose: () => void
  onDone: (account: TelegramAccountDto) => void
  /** The way it opens on. */
  start?: Way
  /** How often Telegram is asked whether the code has been scanned. */
  pollMs?: number
}) {
  const { t } = useTranslation()
  const [way, setWay] = useState<Way>(start)
  const [step, setStep] = useState<Step>(start)
  /** The code on the screen, as Telegram last gave it. */
  const [qr, setQr] = useState<{ link: string; expiresAt: string } | null>(null)
  const [loginId, setLoginId] = useState('')
  /** Where Telegram said it sent the code: into the account's own app, usually — not an SMS to wait for. */
  const [sentBy, setSentBy] = useState<TelegramCodeWay>('app')
  /** The way Telegram offers to send the code again where it never came; null: none. */
  const [nextBy, setNextBy] = useState<TelegramCodeWay | null>(null)
  const [resending, setResending] = useState(false)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  // A connection to Telegram takes a second or two to raise: it is asked for as the window opens, and is there
  // by the time the number has been typed. `held` is the sign-in to let go if the window closes before its end.
  const ready = useRef<Promise<string | null>>(Promise.resolve(null))
  const held = useRef<string | null>(null)
  useEffect(() => {
    const made = api.post<TelegramLoginReady>('/telegram-accounts/login/prepare').then(
      (next) => next.loginId,
      () => null,
    )
    ready.current = made
    void made.then((id) => {
      held.current ??= id
    })
    return () => {
      void made.then(() => {
        if (held.current) {
          void api.post('/telegram-accounts/login/cancel', { loginId: held.current }).catch(() => undefined)
        }
      })
    }
  }, [])

  // The code is asked about every couple of seconds while it is on the screen: still to be scanned (and a fresh
  // one where the last ran out), scanned by an account with a two-step password, or scanned and in.
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (step !== 'qr') {
      return
    }
    let live = true
    let timer: number | undefined
    const ask = async () => {
      try {
        const loginId = held.current ?? (await ready.current) ?? undefined
        const next = await api.post<TelegramLoginStep>('/telegram-accounts/login/qr', { loginId })
        if (!live) {
          return
        }
        held.current = next.loginId
        setLoginId(next.loginId)
        setError(undefined)
        if (next.step === 'done' && next.account) {
          held.current = null
          done.current(next.account)
          return
        }
        if (next.step === 'password') {
          setStep('password')
          return
        }
        setQr(next.qr ?? null)
      } catch (problem) {
        if (!live) {
          return
        }
        const failed = problem instanceof ApiError ? problem : null
        setError(failed ? (Object.values(failed.fields ?? {})[0] ?? failed.message) : String(problem))
      }
      timer = window.setTimeout(() => void ask(), pollMs)
    }
    void ask()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [step, pollMs])

  /** The other way of beginning: what was typed or shown for the first is put away. */
  const turn = (next: Way) => {
    setWay(next)
    setStep(next)
    setError(undefined)
    setQr(null)
  }

  const send = async () => {
    // A code on the screen is scanned, not sent.
    if (step === 'qr') {
      return
    }
    // The bank bots write to an Uzbek number: all nine digits after +998, or it is not one yet.
    if (step === 'phone' && !parsePhone(phone).ok) {
      setError(t('input.phoneIncomplete'))
      return
    }
    const parsed =
      step === 'phone'
        ? telegramLoginStartSchema.safeParse({ phone, loginId: (await ready.current) ?? undefined })
        : step === 'code'
          ? telegramLoginCodeSchema.safeParse({ loginId, code })
          : telegramLoginPasswordSchema.safeParse({ loginId, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const path = step === 'phone' ? '/telegram-accounts/login' : `/telegram-accounts/login/${step}`
      const next = await api.post<TelegramLoginStep>(path, parsed.data)
      if (next.step === 'done' && next.account) {
        // Signed in: the connection is the account's now, not one to let go.
        held.current = null
        onDone(next.account)
        return
      }
      setLoginId(next.loginId)
      held.current = next.loginId
      if (next.sentBy) {
        setSentBy(next.sentBy)
        setNextBy(next.nextBy ?? null)
      }
      setStep(next.step === 'password' ? 'password' : 'code')
    } catch (problem) {
      const failed = problem instanceof ApiError ? problem : null
      // A sign-in left too long starts again from the beginning, the way it was begun.
      if (failed?.code === 'LOGIN_EXPIRED') {
        setStep(way)
        setCode('')
        setPassword('')
      }
      setError(failed ? (Object.values(failed.fields ?? {})[0] ?? failed.message) : String(problem))
    } finally {
      setBusy(false)
    }
  }

  /** The code never came: Telegram is asked for it again, the next way it has. */
  const resend = async () => {
    setResending(true)
    setError(undefined)
    try {
      const next = await api.post<TelegramLoginStep>('/telegram-accounts/login/resend', { loginId })
      setSentBy(next.sentBy ?? sentBy)
      setNextBy(next.nextBy ?? null)
    } catch (problem) {
      const failed = problem instanceof ApiError ? problem : null
      if (failed?.code === 'LOGIN_EXPIRED') {
        setStep('phone')
        setCode('')
      }
      setError(failed ? (Object.values(failed.fields ?? {})[0] ?? failed.message) : String(problem))
    } finally {
      setResending(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('cards.connect')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {/* A code on the screen has nothing to press: the telephone that scans it is the button. */}
          {step === 'qr' ? null : (
            <Button type="submit" form="telegram-connect" variant="primary" loading={busy}>
              {t(step === 'phone' ? 'cards.sendCode' : 'cards.signIn')}
            </Button>
          )}
        </>
      }
    >
      <Form id="telegram-connect" onSubmit={() => void send()}>
        {step === 'qr' || step === 'phone' ? (
          <div data-enter-skip>
            <Segments
              value={way}
              onChange={turn}
              options={[
                { value: 'qr', label: t('cards.byQr') },
                { value: 'phone', label: t('cards.byPhone') },
              ]}
            />
          </div>
        ) : null}
        <p data-connect-note className="text-[13px] text-ink-2">
          {step === 'code' ? t(`cards.sent.${sentBy}`) : t(`cards.step.${step}`)}
        </p>
        {step === 'qr' ? (
          <div data-connect-qr className="flex flex-col items-center gap-2">
            {qr ? (
              <QrCode value={qr.link} label={t('cards.qrLabel')} />
            ) : (
              <div className="size-[220px] animate-pulse rounded-md bg-sunken" />
            )}
            <p className="text-xs text-ink-3">{t('cards.qrHint')}</p>
            {error ? (
              <p role="alert" className="text-xs text-bad">
                {error}
              </p>
            ) : null}
          </div>
        ) : step === 'phone' ? (
          <Field label={t('cards.phone')} error={error} required>
            {(id) => (
              <PhoneInput
                id={id}
                autoFocus
                value={phone}
                onChange={(value) => {
                  setPhone(value)
                  setError(undefined)
                }}
                invalid={!!error}
              />
            )}
          </Field>
        ) : step === 'code' ? (
          <>
            <Field label={t('cards.code')} error={error} required>
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  invalid={!!error}
                />
              )}
            </Field>
            {/* The code never came: Telegram is asked again, the next way it has. Not a field: Enter passes it. */}
            <div data-enter-skip data-resend className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              {nextBy ? (
                <Button variant="soft" size="sm" loading={resending} onClick={() => void resend()}>
                  {t(`cards.resend.${nextBy}`)}
                </Button>
              ) : (
                <span>{t('cards.resendNone')}</span>
              )}
            </div>
          </>
        ) : (
          <Field label={t('cards.password')} error={error} required>
            {(id) => (
              <PasswordInput
                id={id}
                autoFocus
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                invalid={!!error}
              />
            )}
          </Field>
        )}
        <p className="rounded-md bg-sunken px-3 py-2 text-xs text-ink-3">{t('cards.connectSafe')}</p>
      </Form>
    </Dialog>
  )
}

/** A document as a list names it: its number, and whose. */
export function DocumentName({ document }: { document: CardDocumentRef }) {
  const { t } = useTranslation()
  return (
    <span className="min-w-0 truncate">
      <span className="text-ink-3">{t(`cards.doc.${document.type}`)} </span>
      <span className="font-medium">{document.number ?? ''}</span>
      {document.who ? <span className="text-ink-2"> · {document.who}</span> : null}
    </span>
  )
}

/** Where a notice of money stands: still to be said of, tied to its document, or left off the books. */
export function NoticeStanding({ notice }: { notice: CardNoticeDto }) {
  const { t } = useTranslation()
  if (notice.standing === 'open') {
    return <Badge tone="warn">{t('cards.standing.open')}</Badge>
  }
  if (notice.standing === 'linked' && notice.document) {
    return (
      <span
        className="flex min-w-0 items-center gap-1.5"
        title={[t(`cards.way.${notice.linkWay}`), notice.handledByName].filter(Boolean).join(' · ')}
      >
        <Check className="size-3.5 shrink-0 text-ok" />
        <DocumentName document={notice.document} />
      </span>
    )
  }
  if (notice.standing === 'dismissed') {
    return (
      <span className="flex min-w-0 items-center gap-1.5" title={notice.handledByName ?? undefined}>
        <Badge tone="neutral">{t('cards.standing.dismissed')}</Badge>
        <span className="truncate text-ink-3">{notice.reason}</span>
      </span>
    )
  }
  return null
}
