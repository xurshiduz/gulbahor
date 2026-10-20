import type { CardNoticeDto, TelegramAccountDto } from '@erp/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '@/lib/api'

import { bankClock, noticeCard, NoticeSum, TelegramConnectDialog } from './notice-parts'

const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const notice = (more: Partial<CardNoticeDto>): CardNoticeDto => ({
  id: 'n1',
  source: 'telegram',
  bot: 'HUMO Card',
  receivedAt: '2026-10-12T05:20:05.000Z',
  kind: 'move',
  direction: 'out',
  amount: 250_000,
  currency: 'UZS',
  heading: 'To‘lov',
  place: 'AAB CLICK OPLATA>Tos',
  cardTail: '5512',
  at: '2026-10-12T10:20',
  balance: 2_455_180_990,
  accountId: null,
  accountName: null,
  gap: false,
  text: '',
  addedByName: null,
  standing: 'open',
  linkWay: null,
  document: null,
  reason: null,
  handledByName: null,
  handledAt: null,
  ...more,
})

const account = { id: 'a1', name: 'Odil Karimov', phone: '+998901234567', status: 'connected' } as TelegramAccountDto

const LOGIN = '3f2b8c1e-5a47-4d09-9c1b-7e6f0a2d4b18'
/** The connection the window asks for as it opens, before a number is typed. */
const READY = '9a1d4c7e-2b63-4f85-8e0a-5c3b1d7f6e42'

afterEach(() => vi.restoreAllMocks())

describe('a card notice on the screen', () => {
  it('says what moved with its sign and colour, and nothing where no money moved', () => {
    const { rerender, container } = render(<NoticeSum notice={notice({})} />)
    expect(plain(container.textContent)).toBe('−2 500 so‘m')
    expect(container.querySelector('[data-direction]')?.className).toContain('text-bad')
    rerender(<NoticeSum notice={notice({ direction: 'in', amount: 1_360_746 })} />)
    expect(plain(container.textContent)).toBe('+13 607,46 so‘m')
    expect(container.querySelector('[data-direction]')?.className).toContain('text-ok')
    rerender(<NoticeSum notice={notice({ kind: 'unread', direction: null, amount: null })} />)
    expect(container.textContent).toBe('')
  })

  it('writes the bank’s clock as a day is written here, and names the card it knows', () => {
    expect(bankClock('2026-10-12T10:20')).toBe('12.10.2026 10:20')
    expect(noticeCard(notice({}))).toBe('*5512')
    expect(noticeCard(notice({ accountName: 'Humo' }))).toBe('Humo')
    expect(noticeCard(notice({ cardTail: null }))).toBe('')
  })
})

describe('signing a Telegram account in', () => {
  const shown = () => {
    const onDone = vi.fn()
    render(<TelegramConnectDialog start="phone" onClose={vi.fn()} onDone={onDone} />)
    return onDone
  }
  const note = () => plain(document.querySelector('[data-connect-note]')?.textContent)

  it('goes by three steps: the number, the code, and the password where there is one', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ loginId: READY })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'code', account: null })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'password', account: null })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'done', account })
    const onDone = shown()
    expect(note()).toContain('telefon raqamini kiriting')
    // The window says what is done with what is typed into it.
    expect(plain(document.body.textContent)).toContain('hech qayerda saqlanmaydi')

    // The field is an Uzbek number's: +998 stands before it, and what is typed is spaced as it goes.
    const number = screen.getByLabelText(/Telefon raqami/) as HTMLInputElement
    await userEvent.type(number, '901234567')
    expect(number.value).toBe('90 123 45 67')
    await userEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }))
    // Where the code went is said as Telegram said it: into the account's own app, not an SMS to wait for.
    await waitFor(() => expect(note()).toContain('Kod SMS bo‘lib emas, Telegram’ning o‘ziga keldi'))
    // Asked for over the connection that was raised while the number was typed.
    expect(post).toHaveBeenNthCalledWith(1, '/telegram-accounts/login/prepare')
    expect(post).toHaveBeenLastCalledWith('/telegram-accounts/login', { phone: '+998901234567', loginId: READY })

    await userEvent.type(screen.getByLabelText(/Telegram yuborgan kod/), '24 680')
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    await waitFor(() => expect(note()).toContain('ikki bosqichli'))
    expect(post).toHaveBeenLastCalledWith('/telegram-accounts/login/code', { loginId: LOGIN, code: '24680' })

    await userEvent.type(screen.getByLabelText(/Ikki bosqichli parol/), 'sir')
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(account))
    expect(post).toHaveBeenLastCalledWith('/telegram-accounts/login/password', { loginId: LOGIN, password: 'sir' })
  })

  /** Telegram as the window asks it: a connection made ready, then whatever the QR question is answered with. */
  const scanning = (answers: object[]) => {
    const left = [...answers]
    return vi.spyOn(api, 'post').mockImplementation(async (path: string) => {
      if (path.endsWith('/prepare')) {
        return { loginId: READY } as never
      }
      if (path.endsWith('/qr')) {
        // The last answer stands for as long as it is asked.
        return (left.length > 1 ? left.shift() : left[0]) as never
      }
      return (left.length > 1 ? left.shift() : left[0]) as never
    })
  }
  const code = (link: string) => ({
    loginId: READY,
    step: 'qr',
    account: null,
    qr: { link, expiresAt: '2026-10-13T12:00:30.000Z' },
  })

  it('opens on a QR code for the account’s own Telegram to scan, and is in once it is scanned', async () => {
    const post = scanning([
      code('tg://login?token=first'),
      code('tg://login?token=first'),
      { loginId: READY, step: 'done', account },
    ])
    const onDone = vi.fn()
    render(<TelegramConnectDialog pollMs={10} onClose={vi.fn()} onDone={onDone} />)
    // Nothing to type, and nothing to press: what to do on the telephone is said, and the code is drawn.
    expect(note()).toContain('Sozlamalar → Qurilmalar → «Qurilmani ulash»')
    await waitFor(() =>
      expect(document.querySelector('[data-connect-qr] [data-qr]')?.getAttribute('data-qr')).toBe(
        'tg://login?token=first',
      ),
    )
    expect(screen.queryByRole('button', { name: 'Kod yuborish' })).toBeNull()
    expect(screen.queryByLabelText(/Telefon raqami/)).toBeNull()
    // It is asked about over the connection made ready as the window opened.
    expect(post).toHaveBeenCalledWith('/telegram-accounts/login/qr', { loginId: READY })
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(account))
  })

  it('draws the fresh code when the last has run out, and asks for the two-step password where there is one', async () => {
    const post = scanning([
      code('tg://login?token=first'),
      code('tg://login?token=second'),
      { loginId: READY, step: 'password', account: null },
    ])
    const onDone = vi.fn()
    render(<TelegramConnectDialog pollMs={10} onClose={vi.fn()} onDone={onDone} />)
    const password = await screen.findByLabelText(/Ikki bosqichli parol/)
    expect(document.querySelector('[data-connect-qr]')).toBeNull()
    post.mockResolvedValueOnce({ loginId: READY, step: 'done', account } as never)
    await userEvent.type(password, 'sir')
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(account))
    expect(post).toHaveBeenLastCalledWith('/telegram-accounts/login/password', { loginId: READY, password: 'sir' })
  })

  it('offers the number and the code instead, for whoever would rather type', async () => {
    scanning([code('tg://login?token=first')])
    render(<TelegramConnectDialog pollMs={10} onClose={vi.fn()} onDone={vi.fn()} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Telefon raqami bilan' }))
    expect(screen.getByLabelText(/Telefon raqami/)).toBeTruthy()
    expect(document.querySelector('[data-connect-qr]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Kod yuborish' })).toBeTruthy()
    // And back again.
    await userEvent.click(screen.getByRole('radio', { name: 'QR kod bilan' }))
    await waitFor(() => expect(document.querySelector('[data-connect-qr] [data-qr]')).not.toBeNull())
  })

  it('lets the connection go when the window is closed before anyone has signed in', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ loginId: READY } as never)
    const { unmount } = render(<TelegramConnectDialog start="phone" onClose={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(post).toHaveBeenCalledWith('/telegram-accounts/login/prepare'))
    unmount()
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/telegram-accounts/login/cancel', { loginId: READY }))
  })

  it('is done at the code where the account has no password', async () => {
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ loginId: READY })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'code', account: null })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'done', account })
    const onDone = shown()
    await userEvent.type(screen.getByLabelText(/Telefon raqami/), '901234567')
    await userEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }))
    await userEvent.type(await screen.findByLabelText(/Telegram yuborgan kod/), '24680')
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(account))
  })

  it('asks for the code again the next way Telegram has, when it never came', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ loginId: READY })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'code', account: null, sentBy: 'app', nextBy: 'sms' })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'code', account: null, sentBy: 'sms', nextBy: null })
    shown()
    await userEvent.type(screen.getByLabelText(/Telefon raqami/), '901234567')
    await userEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kod kelmadimi? SMS qilib yuborish' }))
    await waitFor(() => expect(note()).toContain('SMS qilib yubordi'))
    expect(post).toHaveBeenLastCalledWith('/telegram-accounts/login/resend', { loginId: LOGIN })
    // Telegram has no further way: nothing more is offered.
    expect(screen.queryByRole('button', { name: /Kod kelmadimi/ })).toBeNull()
    expect(plain(document.querySelector('[data-resend]')?.textContent)).toContain(
      'boshqa yo‘l bilan yuborishni taklif qilmadi',
    )
  })

  it('says so when Telegram sent the code some other way than into its app', async () => {
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ loginId: READY })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'code', account: null, sentBy: 'sms' })
    shown()
    await userEvent.type(screen.getByLabelText(/Telefon raqami/), '901234567')
    await userEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }))
    await waitFor(() => expect(note()).toContain('SMS qilib yubordi'))
  })

  it('says what is wrong under the field, and starts again from the number when the sign-in has lapsed', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ loginId: READY })
      .mockResolvedValueOnce({ loginId: LOGIN, step: 'code', account: null })
      .mockRejectedValueOnce(new ApiError(400, 'VALIDATION', 'Xato', { code: 'Kod noto‘g‘ri' }))
      .mockRejectedValueOnce(new ApiError(400, 'LOGIN_EXPIRED', 'Kirish vaqti o‘tdi: telefon raqamidan qayta boshlang'))
    shown()
    // A number that is not whole goes nowhere.
    await userEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }))
    expect(screen.getByText('Telefon raqam to‘liq emas')).toBeTruthy()
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenLastCalledWith('/telegram-accounts/login/prepare')

    await userEvent.type(screen.getByLabelText(/Telefon raqami/), '901234567')
    await userEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }))
    await userEvent.type(await screen.findByLabelText(/Telegram yuborgan kod/), '11111')
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    await waitFor(() => expect(screen.getByText('Kod noto‘g‘ri')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    await waitFor(() => expect(screen.getByText(/telefon raqamidan qayta boshlang/)).toBeTruthy())
    expect(screen.getByLabelText(/Telefon raqami/)).toBeTruthy()
  })
})
