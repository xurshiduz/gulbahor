import { randomUUID } from 'node:crypto'

import type { CardNoticeDto, CardNoticeSummary, TelegramAccountDto, TelegramLoginStep } from '@erp/core'

import {
  SignedOut,
  TelegramRefusal,
  type BotChat,
  type ChatMessage,
  type TelegramDriver,
  type TelegramLink,
  type TelegramLogin,
} from './modules/cards/telegram.driver'
import { TelegramGateway } from './modules/cards/telegram.gateway'
import { RealtimeService } from './modules/realtime/realtime.service'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const lines = (...parts: string[]) => parts.join('\n')

const HUMO = '5001'
const CARDXABAR = '5002'
const FATHER = '5003'

/** A Telegram of our own: one account, its chats, and what was written in them. */
class FakeTelegram implements TelegramDriver {
  readonly code = '24680'
  /** The account's two-step password; null where it has none. */
  password: string | null = 'ikki-bosqich'
  /** Telegram has ended every session of the account. */
  ended = false
  chats: BotChat[] = [
    { id: HUMO, title: 'HUMO Card', username: 'HUMOcardbot' },
    { id: CARDXABAR, title: 'CardXabar', username: 'CardXabarBot' },
    { id: FATHER, title: 'BotFather', username: 'BotFather' },
  ]
  private readonly written = new Map<string, ChatMessage[]>()
  private readonly ears = new Set<(message: ChatMessage) => void>()
  private count = 0
  /** How many sessions were ended at Telegram itself. */
  signedOut = 0
  /** The account's own app has scanned the QR code on the screen. */
  scanned = false
  /** How many QR codes were made. */
  codes = 0
  /** How many times the code was asked for again. */
  resent = 0
  /** How Telegram says it sends its code. */
  codeBy: 'app' | 'sms' = 'app'

  /** How many times a chat's history was asked for. */
  reads: { chatId: string; afterId?: number }[] = []

  /** A bot writes; every open connection hears it. */
  say(chatId: string, text: string, at = new Date()): ChatMessage {
    const message = { chatId, id: ++this.count, date: at, text }
    this.written.set(chatId, [...(this.written.get(chatId) ?? []), message])
    this.ears.forEach((ear) => ear(message))
    return message
  }

  private link(): TelegramLink {
    let ear: ((message: ChatMessage) => void) | null = null
    const alive = () => {
      if (this.ended) {
        throw new SignedOut()
      }
    }
    return {
      me: async () => ({ id: '777', name: 'Odil Karimov', phone: '+998901234567' }),
      botChats: async () => this.chats,
      history: async (chatId, { limit, afterId }) => {
        alive()
        this.reads.push({ chatId, afterId })
        return (this.written.get(chatId) ?? []).filter((message) => !afterId || message.id > afterId).slice(-limit)
      },
      listen: (handler) => {
        ear = handler
        this.ears.add(handler)
      },
      keepUp: async () => alive(),
      close: async () => {
        if (ear) {
          this.ears.delete(ear)
        }
      },
      end: async () => {
        if (ear) {
          this.ears.delete(ear)
        }
        this.signedOut += 1
      },
    }
  }

  /** How many connections were raised for signing in, and how many of them were let go unused. */
  logins = 0
  cancelled = 0

  async login(): Promise<TelegramLogin> {
    let signed = false
    this.logins += 1
    return {
      sendCode: async (phone) => {
        if (!phone.startsWith('+998')) {
          throw new TelegramRefusal('phone')
        }
        return { way: this.codeBy, next: this.codeBy === 'app' ? ('sms' as const) : null }
      },
      scan: async () => {
        if (!this.scanned) {
          this.codes += 1
          return {
            state: 'waiting' as const,
            link: `tg://login?token=code-${this.codes}`,
            expires: new Date(Date.now() + 30_000),
          }
        }
        if (this.password) {
          return { state: 'password' as const }
        }
        signed = true
        return { state: 'done' as const }
      },
      resendCode: async () => {
        this.resent += 1
        return { way: 'sms' as const, next: null }
      },
      signIn: async (code) => {
        if (code !== this.code) {
          throw new TelegramRefusal('code')
        }
        signed = !this.password
        return this.password ? 'password' : 'done'
      },
      checkPassword: async (password) => {
        if (password !== this.password) {
          throw new TelegramRefusal('password')
        }
        signed = true
      },
      finish: async () => {
        expect(signed).toBe(true)
        this.ended = false
        return { session: 'the-key-of-the-whole-account', link: this.link() }
      },
      cancel: async () => {
        this.cancelled += 1
      },
    }
  }

  async open(session: string): Promise<TelegramLink> {
    expect(session).toBe('the-key-of-the-whole-account')
    if (this.ended) {
      throw new SignedOut()
    }
    return this.link()
  }
}

/** What the banks' bots write, as they write it (the figures are made up, the shape is theirs). */
const humo = {
  topUp: lines(
    '🎉 To‘ldirish',
    '➕ 13.607,46 UZS',
    '📍 ZOOMRAD P2P VISA2HUM',
    '💳 HUMOCARD *5512',
    '🕓 20:04 11.10.2026',
    '💰 24.554.309,90 UZS',
  ),
  payment: lines(
    '💸 To‘lov',
    '➖ 2.500,00 UZS',
    '📍 AAB CLICK OPLATA>Tos',
    '💳 HUMOCARD *5512',
    '🕙 10:20 12.10.2026',
    '💰 24.551.809,90 UZS',
  ),
  next: lines(
    '💸 To‘lov',
    '➖ 48.000,00 UZS',
    '📍 CLICK OPLATA>TOSHKEN',
    '💳 HUMOCARD *5512',
    '🕑 14:04 12.10.2026',
    '💰 24.503.809,90 UZS',
  ),
}
const cardXabar = {
  paid: lines(
    '🔴 E-Com oplata',
    '➖ 120 000.00 UZS',
    '💳 ***7741',
    '📍 AO PAYNET MOBILE, UZ',
    '🕓 19.09.26 10:27',
    '💵 926 187.00 UZS',
  ),
  // Not what follows the one before it: others came between them and were not sent on.
  came: lines(
    '🟢 Perevod na kartu',
    '➕ 50 000.00 UZS',
    '💳 ***7741',
    '📍 IYB VISACREDIT2UZCARD OTH, UZ',
    '🕓 23.09.26 16:19',
    '💵 550 845.00 UZS',
  ),
}

/**
 * Card control, as far as reading goes (KEYINGI-REJA, 18-bo'lim): a Telegram account is signed into from here
 * in three steps, its chats with the banks' bots — those alone — are read, and what they wrote is kept once,
 * read as far as it can be, and set in order on its card. No money moves.
 */
describe('Card control: reading', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let telegram: FakeTelegram
  let accountId: string

  const list = async (query: Record<string, unknown> = {}, agent = alpha) =>
    (
      await agent
        .get('/api/card-notices')
        .query({ size: 100, ...query })
        .expect(200)
    ).body as {
      items: CardNoticeDto[]
      total: number
      summary: CardNoticeSummary
    }
  const accounts = async () =>
    (await alpha.get('/api/telegram-accounts').expect(200)).body as {
      configured: boolean
      accounts: TelegramAccountDto[]
    }
  const heard = () => new Promise((resolve) => setTimeout(resolve, 150))
  /** What is kept of the account's session, read past the business's own walls. */
  const sessionOf = () =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      const [row] = await em.query(`SELECT session FROM telegram_accounts WHERE id = $1`, [accountId])
      return row.session as string | null
    })
  const signIn = async () => {
    const started = (await alpha.post('/api/telegram-accounts/login').send({ phone: '+998 90 123 45 67' }).expect(200))
      .body as TelegramLoginStep
    await alpha
      .post('/api/telegram-accounts/login/code')
      .send({ loginId: started.loginId, code: telegram.code })
      .expect(200)
    return (
      await alpha
        .post('/api/telegram-accounts/login/password')
        .send({ loginId: started.loginId, password: telegram.password })
        .expect(200)
    ).body as TelegramLoginStep
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    telegram = new FakeTelegram()
    harness.app.get(TelegramGateway).driver = telegram
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('is a module of its own: off, nothing of it answers', async () => {
    const refused = await alpha.get('/api/card-notices')
    expect(refused.status).toBe(403)
    expect(refused.body.error.code).toBe('MODULE_OFF')
    for (const agent of [alpha, beta]) {
      await agent
        .put('/api/org/modules')
        .send({ modules: ['cards'] })
        .expect(200)
    }
    expect(await list()).toMatchObject({ items: [], total: 0, summary: { unread: 0, gaps: 0, unknownCards: [] } })
    expect(await accounts()).toEqual({ configured: true, accounts: [] })
  })

  it('signs an account in in three steps, each refused where it is wrong', async () => {
    // What the bots had written before anyone signed in.
    telegram.say(HUMO, humo.topUp, new Date('2026-10-11T15:04:10Z'))
    telegram.say(HUMO, humo.payment, new Date('2026-10-12T05:20:05Z'))
    telegram.say(CARDXABAR, cardXabar.paid, new Date('2026-09-19T05:27:30Z'))
    telegram.say(FATHER, 'Done! Congratulations on your new bot.')

    const short = await alpha.post('/api/telegram-accounts/login').send({ phone: '90 123 45 67' })
    expect(short.status).toBe(400)
    expect(short.body.error.fields.phone).toContain('+998')
    const foreign = await alpha.post('/api/telegram-accounts/login').send({ phone: '+12025550123' })
    expect(foreign.body.error.fields).toEqual({ phone: 'Telegram bu raqamni qabul qilmadi' })

    const started = (await alpha.post('/api/telegram-accounts/login').send({ phone: '+998 90 123 45 67' }).expect(200))
      .body as TelegramLoginStep
    // How Telegram sent its code is passed on: the window says where to look for it.
    expect(started).toMatchObject({ step: 'code', account: null, sentBy: 'app', nextBy: 'sms' })
    // The code never came: asked for again, it goes the next way Telegram has.
    const resent = (
      await alpha.post('/api/telegram-accounts/login/resend').send({ loginId: started.loginId }).expect(200)
    ).body as TelegramLoginStep
    expect(resent).toMatchObject({ loginId: started.loginId, step: 'code', sentBy: 'sms', nextBy: null })
    expect(telegram.resent).toBe(1)

    const wrong = await alpha
      .post('/api/telegram-accounts/login/code')
      .send({ loginId: started.loginId, code: '11111' })
    expect(wrong.body.error.fields).toEqual({ code: 'Kod noto‘g‘ri' })
    // Somebody else of the same business cannot carry another's sign-in on, nor can another business.
    const theirs = await beta
      .post('/api/telegram-accounts/login/code')
      .send({ loginId: started.loginId, code: telegram.code })
    expect(theirs.body.error.code).toBe('LOGIN_EXPIRED')

    const coded = (
      await alpha
        .post('/api/telegram-accounts/login/code')
        .send({ loginId: started.loginId, code: '2 4 6 8 0' })
        .expect(200)
    ).body as TelegramLoginStep
    expect(coded.step).toBe('password')
    const guess = await alpha
      .post('/api/telegram-accounts/login/password')
      .send({ loginId: started.loginId, password: 'bilmayman' })
    expect(guess.body.error.fields).toEqual({ password: 'Parol noto‘g‘ri' })

    const done = (
      await alpha
        .post('/api/telegram-accounts/login/password')
        .send({ loginId: started.loginId, password: telegram.password })
        .expect(200)
    ).body as TelegramLoginStep
    expect(done.step).toBe('done')
    // The banks' chats, and no other bot's.
    expect(done.account).toMatchObject({
      phone: '+998901234567',
      name: 'Odil Karimov',
      status: 'connected',
      chats: [
        { id: HUMO, title: 'HUMO Card' },
        { id: CARDXABAR, title: 'CardXabar' },
      ],
      error: null,
    })
    accountId = done.account!.id
    // The sign-in is spent: it cannot be finished twice.
    const again = await alpha
      .post('/api/telegram-accounts/login/code')
      .send({ loginId: started.loginId, code: telegram.code })
    expect(again.body.error.code).toBe('LOGIN_EXPIRED')
  })

  it('keeps of the account its session’s key alone, and that sealed', async () => {
    const row = { session: await sessionOf() }
    expect(row.session).toMatch(/^v1:/)
    expect(row.session).not.toContain('the-key-of-the-whole-account')
    const gateway = harness.app.get(TelegramGateway)
    expect(gateway.open(row.session as string)).toBe('the-key-of-the-whole-account')
    expect(
      gateway.open('v1:' + Buffer.from('not what was sealed, long enough to look it').toString('base64')),
    ).toBeNull()
    // Nothing of it goes to the screen.
    expect(JSON.stringify(await accounts())).not.toContain('session')
  })

  it('reads what the banks had written, each notice as far as it can be read', async () => {
    const { items, total, summary } = await list()
    expect(total).toBe(3)
    // Neither card is the business's yet: both are said to be unknown.
    expect(summary).toMatchObject({ unread: 0, gaps: 0, unknownCards: ['5512', '7741'] })
    const payment = items.find((notice) => notice.place === 'AAB CLICK OPLATA>Tos')!
    expect(payment).toMatchObject({
      source: 'telegram',
      bot: 'HUMO Card',
      kind: 'move',
      direction: 'out',
      amount: som(2500),
      currency: 'UZS',
      heading: 'To‘lov',
      cardTail: '5512',
      at: '2026-10-12T10:20',
      balance: som(24_551_809.9),
      accountId: null,
      gap: false,
      receivedAt: '2026-10-12T05:20:05.000Z',
    })
    expect(payment.text).toBe(humo.payment)
    expect(items.find((notice) => notice.bot === 'CardXabar')).toMatchObject({
      direction: 'out',
      amount: som(120_000),
      cardTail: '7741',
      at: '2026-09-19T10:27',
      balance: som(926_187),
    })
    // The newest first.
    expect(items.map((notice) => notice.at)).toEqual(['2026-10-12T10:20', '2026-10-11T20:04', '2026-09-19T10:27'])
  })

  it('hears a notice as it comes, and passes over what is written in any other chat', async () => {
    telegram.say(HUMO, humo.next, new Date('2026-10-12T09:04:20Z'))
    telegram.say(FATHER, lines('➕ 1.000,00 UZS', '💳 HUMOCARD *5512'))
    await heard()
    const { items, total } = await list()
    expect(total).toBe(4)
    expect(items[0]).toMatchObject({ amount: som(48_000), direction: 'out', gap: false })
  })

  it('keeps a message once, however often its chat is read, and reads on from where it left', async () => {
    telegram.reads = []
    const read = (await alpha.post(`/api/telegram-accounts/${accountId}/read`).expect(200)).body as TelegramAccountDto
    expect(read.status).toBe('connected')
    expect(read.lastSeenAt).not.toBeNull()
    expect((await list()).total).toBe(4)
    // What was heard live was not counted as read: the chat is asked from the last message read through.
    expect(telegram.reads).toEqual([
      { chatId: HUMO, afterId: 2 },
      { chatId: CARDXABAR, afterId: 3 },
    ])
    await alpha.post(`/api/telegram-accounts/${accountId}/read`).expect(200)
    expect(telegram.reads.at(-2)).toEqual({ chatId: HUMO, afterId: 5 })
  })

  it('marks a notice that does not follow on from the one before it on its card', async () => {
    telegram.say(CARDXABAR, cardXabar.came, new Date('2026-09-23T11:19:40Z'))
    await heard()
    const { items, summary } = await list({ state: 'gap' })
    expect(summary.gaps).toBe(1)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ cardTail: '7741', direction: 'in', amount: som(50_000), gap: true })
    // The other card's notices follow one another to the tiyin.
    expect((await list({ direction: 'out' })).items.every((notice) => !notice.gap)).toBe(true)
  })

  it('knows a card by its last digits once the business keeps it', async () => {
    const card = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'card', name: 'Humo', cardNumber: '9860 1234 5678 5512' })
        .expect(201)
    ).body
    const { items, summary } = await list({ accountId: card.id })
    expect(summary.unknownCards).toEqual(['7741'])
    expect(items).toHaveLength(3)
    expect(items.every((notice) => notice.accountName === 'Humo')).toBe(true)
    expect((await list({ state: 'unknown_card' })).items.map((notice) => notice.cardTail)).toEqual(['7741', '7741'])
    // The banks' bots write of so'm cards alone: a dollar card that happens to end the same is not the one meant.
    await alpha
      .post('/api/money/accounts')
      .send({ kind: 'card', name: 'Visa', currency: 'USD', cardNumber: '4111 1111 1111 7741' })
      .expect(201)
    expect((await list()).summary.unknownCards).toEqual(['7741'])
    // Nor is a Humo card: CardXabar writes of the other kind, and each bot of its own.
    await alpha
      .post('/api/money/accounts')
      .send({ kind: 'card', name: 'Humo 2', cardNumber: '9860 0000 1111 7741' })
      .expect(201)
    expect((await list()).summary.unknownCards).toEqual(['7741'])
    await alpha
      .post('/api/money/accounts')
      .send({ kind: 'card', name: 'Uzcard', cardNumber: '8600 1111 2222 7741' })
      .expect(201)
    const known = await list({ q: 'paynet' })
    expect(known.summary.unknownCards).toEqual([])
    expect(known.items[0].accountName).toBe('Uzcard')
  })

  it('looks through them by day, by what they say, and by which way the money went', async () => {
    expect((await list({ from: '2026-10-12', to: '2026-10-12' })).total).toBe(2)
    expect((await list({ to: '2026-09-30' })).total).toBe(2)
    expect((await list({ q: 'paynet' })).items.map((notice) => notice.place)).toEqual(['AO PAYNET MOBILE, UZ'])
    expect((await list({ direction: 'in' })).items.map((notice) => notice.amount)).toEqual([
      som(13_607.46),
      som(50_000),
    ])
  })

  it('takes a notice put in by hand once, in its place by the bank’s own clock, and keeps what it cannot read', async () => {
    const earlier = lines(
      '💸 To‘lov',
      '➖ 10.000,00 UZS',
      '📍 KORZINKA',
      '💳 HUMOCARD *5512',
      '🕘 09:00 11.10.2026',
      '💰 24.540.702,44 UZS',
    )
    const pasted = (await alpha.post('/api/card-notices').send({ text: earlier }).expect(201)).body as CardNoticeDto
    expect(pasted).toMatchObject({
      source: 'manual',
      bot: null,
      kind: 'move',
      accountName: 'Humo',
      addedByName: 'Alpha Owner',
    })
    // 09:00 in Tashkent: before the top-up of that evening, which follows on from it.
    expect(pasted.receivedAt).toBe('2026-10-11T04:00:00.000Z')
    expect((await list({ state: 'gap' })).total).toBe(1)
    const twice = await alpha.post('/api/card-notices').send({ text: `  ${earlier.replace(/\n/g, ' \n')}  ` })
    expect(twice.body.error.fields).toEqual({ text: 'Bu xabar avval kiritilgan' })

    const riddle = (
      await alpha.post('/api/card-notices').send({ text: 'Hurmatli mijoz! Kartangiz muddati tugayapti.' }).expect(201)
    ).body as CardNoticeDto
    expect(riddle).toMatchObject({ kind: 'unread', direction: null, amount: null, cardTail: null })
    expect((await list({ state: 'unread' })).items.map((notice) => notice.id)).toEqual([riddle.id])
    expect((await list()).summary.unread).toBe(1)
  })

  it('keeps one business’s accounts and notices from another, and from those not let in', async () => {
    expect(await list({}, beta)).toMatchObject({ total: 0, summary: { unknownCards: [] } })
    expect((await beta.get('/api/telegram-accounts').expect(200)).body.accounts).toEqual([])
    await beta.post(`/api/telegram-accounts/${accountId}/read`).expect(404)

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Hisobchi',
        login: 'hisobchi',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'accountant')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    const accountant = await harness.signIn('hisobchi')
    // What leaves the owner's cards is the owner's to show: no ready-made role sees it.
    await accountant.get('/api/card-notices').expect(403)
    await accountant.get('/api/card-notices/stand').expect(403)
    await accountant.get('/api/card-entries').expect(403)
    // A payment window offers them all the same: whoever writes card money picks it from what the bank wrote.
    await accountant.get('/api/card-notices/picks').query({ direction: 'in' }).expect(200)
    await accountant.get('/api/telegram-accounts').expect(403)
    await accountant.post('/api/card-notices').send({ text: humo.topUp }).expect(403)
  })

  it('says when Telegram has ended the session, and reads on once the account is signed in again', async () => {
    telegram.ended = true
    const out = (await alpha.post(`/api/telegram-accounts/${accountId}/reconnect`).expect(200))
      .body as TelegramAccountDto
    expect(out).toMatchObject({ status: 'signed_out', error: expect.stringContaining('qayta kirish') })
    const row = { session: await sessionOf() }
    expect(row.session).toBeNull()

    // The bank goes on writing meanwhile.
    const missed = lines(
      '🎉 To‘ldirish',
      '➕ 100.000,00 UZS',
      '📍 PAYME P2P',
      '💳 HUMOCARD *5512',
      '🕔 17:00 12.10.2026',
      '💰 24.603.809,90 UZS',
    )
    telegram.say(HUMO, missed, new Date('2026-10-12T12:00:10Z'))
    await heard()
    const before = (await list()).total

    telegram.reads = []
    const back = await signIn()
    // The same account, not a second one — and its chats are read from where they were left.
    expect(back.account).toMatchObject({ id: accountId, status: 'connected', error: null })
    expect((await accounts()).accounts).toHaveLength(1)
    expect(telegram.reads[0]).toMatchObject({ chatId: HUMO })
    expect(telegram.reads[0].afterId).toBeGreaterThan(0)
    const after = await list()
    expect(after.total).toBe(before + 1)
    expect(after.items.find((notice) => notice.amount === som(100_000))).toMatchObject({ direction: 'in', gap: false })
  })

  it('raises the connection as the window opens, and asks for the code over that same one', async () => {
    const before = { logins: telegram.logins, cancelled: telegram.cancelled }
    const ready = (await alpha.post('/api/telegram-accounts/login/prepare').expect(200)).body as { loginId: string }
    expect(telegram.logins).toBe(before.logins + 1)
    // Nothing was asked of it yet: there is no code to type against it.
    const early = await alpha.post('/api/telegram-accounts/login/code').send({ loginId: ready.loginId, code: '12345' })
    expect(early.body.error.code).toBe('LOGIN_EXPIRED')
    // A number Telegram will not have is typed again over the same connection.
    const foreign = await alpha
      .post('/api/telegram-accounts/login')
      .send({ phone: '+12025550123', loginId: ready.loginId })
    expect(foreign.status).toBe(400)
    const started = (
      await alpha
        .post('/api/telegram-accounts/login')
        .send({ phone: '+998 90 123 45 67', loginId: ready.loginId })
        .expect(200)
    ).body as TelegramLoginStep
    expect(started).toMatchObject({ loginId: ready.loginId, step: 'code' })
    expect(telegram.logins).toBe(before.logins + 1)
    expect(telegram.cancelled).toBe(before.cancelled)
    // The window closed without signing in: the connection is let go.
    await alpha.post('/api/telegram-accounts/login/cancel').send({ loginId: ready.loginId }).expect(200)
    expect(telegram.cancelled).toBe(before.cancelled + 1)

    // A window opened twice keeps one connection, not two; another person cannot take it over.
    const first = (await alpha.post('/api/telegram-accounts/login/prepare').expect(200)).body as { loginId: string }
    const second = (await alpha.post('/api/telegram-accounts/login/prepare').expect(200)).body as { loginId: string }
    expect(second.loginId).not.toBe(first.loginId)
    expect(telegram.cancelled).toBe(before.cancelled + 2)
    await beta.post('/api/telegram-accounts/login/cancel').send({ loginId: second.loginId })
    expect(telegram.cancelled).toBe(before.cancelled + 2)
    await alpha.post('/api/telegram-accounts/login/cancel').send({ loginId: second.loginId }).expect(200)
    expect(telegram.cancelled).toBe(before.cancelled + 3)
  })

  it('signs an account in by a QR code its own app scans, with no number and no code typed', async () => {
    telegram.scanned = false
    const first = (await alpha.post('/api/telegram-accounts/login/qr').send({}).expect(200)).body as TelegramLoginStep
    expect(first).toMatchObject({ step: 'qr', account: null })
    expect(first.qr?.link).toMatch(/^tg:\/\/login\?token=/)
    expect(new Date(first.qr?.expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now())
    // Asked again, it is the same sign-in, still waiting; no code can be typed against it, and it is nobody else's.
    const again = (await alpha.post('/api/telegram-accounts/login/qr').send({ loginId: first.loginId }).expect(200))
      .body as TelegramLoginStep
    expect(again).toMatchObject({ loginId: first.loginId, step: 'qr' })
    const typed = await alpha.post('/api/telegram-accounts/login/code').send({ loginId: first.loginId, code: '12345' })
    expect(typed.body.error.code).toBe('LOGIN_EXPIRED')
    const theirs = (await beta.post('/api/telegram-accounts/login/qr').send({ loginId: first.loginId }))
      .body as Partial<TelegramLoginStep>
    expect(theirs.loginId).not.toBe(first.loginId)

    // The account's own app scans it. This account keeps a two-step password: that is asked for, then it is in.
    telegram.scanned = true
    const scanned = (await alpha.post('/api/telegram-accounts/login/qr').send({ loginId: first.loginId }).expect(200))
      .body as TelegramLoginStep
    expect(scanned).toMatchObject({ loginId: first.loginId, step: 'password', account: null })
    const done = (
      await alpha
        .post('/api/telegram-accounts/login/password')
        .send({ loginId: first.loginId, password: telegram.password })
        .expect(200)
    ).body as TelegramLoginStep
    expect(done.step).toBe('done')
    // Whose account it is, the account says itself: nobody typed a number.
    expect(done.account).toMatchObject({ id: accountId, phone: '+998901234567', status: 'connected' })
    telegram.scanned = false
  })

  it('stops reading an account that is switched off, and throws its key away', async () => {
    const ended = telegram.signedOut
    const off = (await alpha.post(`/api/telegram-accounts/${accountId}/off`).expect(200)).body as TelegramAccountDto
    expect(off.status).toBe('off')
    // Off at Telegram too: the session leaves the account's own list of devices.
    expect(telegram.signedOut).toBe(ended + 1)
    const total = (await list()).total
    telegram.say(HUMO, humo.topUp.replace('13.607,46', '1.000,00'))
    await heard()
    expect((await list()).total).toBe(total)
    const row = { session: await sessionOf() }
    expect(row.session).toBeNull()
    // What it had read stays.
    expect(total).toBeGreaterThan(5)
  })
})

/** An account may be signed in before it has ever written to a bank's bot; the bot may be started any day after. */
describe('Card control: a bank’s bot started later', () => {
  let harness: Harness
  let alpha: Agent
  let telegram: FakeTelegram

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    telegram = new FakeTelegram()
    telegram.password = null
    // Neither bank's bot yet: only a chat that is nobody's.
    telegram.chats = [{ id: FATHER, title: 'BotFather', username: 'BotFather' }]
    harness.app.get(TelegramGateway).driver = telegram
    await alpha
      .put('/api/org/modules')
      .send({ modules: ['cards'] })
      .expect(200)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('signs the account in all the same, reading nothing, and finds the bot once it writes', async () => {
    const started = (await alpha.post('/api/telegram-accounts/login').send({ phone: '+998901234567' }).expect(200))
      .body as TelegramLoginStep
    // No two-step password on this account: the code is the last step.
    const done = (
      await alpha
        .post('/api/telegram-accounts/login/code')
        .send({ loginId: started.loginId, code: telegram.code })
        .expect(200)
    ).body as TelegramLoginStep
    expect(done).toMatchObject({ step: 'done', account: { status: 'connected', chats: [] } })
    const id = done.account!.id

    // The owner presses "start" in HUMO's bot, and the bank writes.
    telegram.chats.push({ id: HUMO, title: 'HUMO Card', username: 'HUMOcardbot' })
    telegram.say(HUMO, humo.topUp, new Date('2026-10-11T15:04:10Z'))
    await new Promise((resolve) => setTimeout(resolve, 200))
    const notices = (await alpha.get('/api/card-notices').expect(200)).body
    expect(notices.total).toBe(1)
    expect(notices.items[0]).toMatchObject({ bot: 'HUMO Card', direction: 'in', cardTail: '5512' })
    const [account] = (await alpha.get('/api/telegram-accounts').expect(200)).body.accounts as TelegramAccountDto[]
    expect(account.chats).toEqual([{ id: HUMO, title: 'HUMO Card' }])

    // The other bank's bot, started later still and silent since: the next reading finds it and what it holds.
    telegram.chats.push({ id: CARDXABAR, title: 'CardXabar', username: 'CardXabarBot' })
    const quiet = harness.app.get(TelegramGateway)
    expect(quiet.configured).toBe(true)
    // Written before anyone was listening for that chat: not heard, but there to be read.
    const before = telegram.say(CARDXABAR, cardXabar.paid, new Date('2026-09-19T05:27:30Z'))
    expect(before.chatId).toBe(CARDXABAR)
    const read = (await alpha.post(`/api/telegram-accounts/${id}/read`).expect(200)).body as TelegramAccountDto
    expect(read.chats.map((chat) => chat.title)).toEqual(['HUMO Card', 'CardXabar'])
    expect((await alpha.get('/api/card-notices').expect(200)).body.total).toBe(2)
  })

  it('tells the screens at once when money lands on a card, and only then', async () => {
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const card = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'card', name: 'Humo', cardNumber: '9860123456785512', locationIds: [shopId] })
        .expect(201)
    ).body
    const said = jest.spyOn(harness.app.get(RealtimeService), 'event')
    const heard = () => new Promise((resolve) => setTimeout(resolve, 200))
    const events = () => said.mock.calls.filter(([, name]) => name === 'card.in')

    // What leaves the card is nobody's news but the owner's, and what a chat held before is no news at all.
    telegram.say(HUMO, humo.payment)
    telegram.say(HUMO, humo.next, new Date(Date.now() - 3 * 60 * 60_000))
    telegram.say(HUMO, humo.topUp.replace('13.607,46', '7.000,00'), new Date(Date.now() - 60 * 60_000))
    await heard()
    expect(events()).toEqual([])

    telegram.say(HUMO, humo.topUp.replace('13.607,46', '150.000,00'))
    await heard()
    expect(events()).toHaveLength(1)
    const [orgId, , payload] = events()[0]
    expect(typeof orgId).toBe('string')
    // How much and on which card — and not a word of what is left on it.
    expect(payload).toEqual({
      id: expect.any(String),
      accountId: card.id,
      card: 'Humo',
      amount: som(150_000),
      currency: 'UZS',
      at: '2026-10-11T20:04',
      locationIds: [shopId],
    })
    // Read again, the same message is no news twice.
    const [account] = (await alpha.get('/api/telegram-accounts').expect(200)).body.accounts as TelegramAccountDto[]
    await alpha.post(`/api/telegram-accounts/${account.id}/read`).expect(200)
    expect(events()).toHaveLength(1)
    said.mockRestore()
  })
})

/**
 * Card control set beside the books (KEYINGI-REJA, 18-bo'lim, T2): the money a card took is picked from what its
 * bank wrote, a notice is tied to the one document it fits, a document undone gives its notices back, and what is
 * left is settled by a person — matched to money already in the books, or knowingly left off. No money moves.
 */
describe('Card control: set beside the books', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let telegram: FakeTelegram
  let cardId: string
  let registerId: string
  let coat: string
  let nodira: string
  let anvar: string
  let kitchen: string

  const heard = () => new Promise((resolve) => setTimeout(resolve, 200))
  const came = (sum: string, at = new Date()) => telegram.say(HUMO, humo.topUp.replace('13.607,46', sum), at)
  const went = (sum: string, at = new Date()) => telegram.say(HUMO, humo.payment.replace('2.500,00', sum), at)
  const notices = async (query: Record<string, unknown> = {}) =>
    (
      await alpha
        .get('/api/card-notices')
        .query({ size: 100, ...query })
        .expect(200)
    ).body as {
      items: CardNoticeDto[]
      summary: CardNoticeSummary
    }
  const noticeOf = async (amount: number, direction: 'in' | 'out' = 'in') =>
    (await notices()).items.find(
      (notice) => notice.amount === amount && notice.direction === direction,
    ) as CardNoticeDto
  const sell = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/sales').send({ clientKey: randomUUID(), registerId, ...body })
  const pay = (customerId: string, amount: number, noticeIds?: string[]) =>
    alpha.post('/api/customer-payments').send({
      clientKey: randomUUID(),
      customerId,
      kind: 'in',
      lines: [{ accountId: cardId, amount, noticeIds }],
      settled: amount,
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    telegram = new FakeTelegram()
    telegram.password = null
    harness.app.get(TelegramGateway).driver = telegram
    await alpha
      .put('/api/org/modules')
      .send({ modules: ['cards'] })
      .expect(200)
    const started = (await alpha.post('/api/telegram-accounts/login').send({ phone: '+998901234567' }).expect(200))
      .body as TelegramLoginStep
    await alpha
      .post('/api/telegram-accounts/login/code')
      .send({ loginId: started.loginId, code: telegram.code })
      .expect(200)

    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    cardId = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'card', name: 'Humo', cardNumber: '9860123456785512', locationIds: [shopId] })
        .expect(201)
    ).body.id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    coat = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Palto',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(150_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const receipt = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: coat, qty: 10, price: som(60_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
    nodira = (await alpha.post('/api/customers').send({ name: 'Nodira' }).expect(201)).body.id
    anvar = (await alpha.post('/api/customers').send({ name: 'Anvar' }).expect(201)).body.id
    kitchen = ((await alpha.get('/api/money/categories')).body as { id: string; kind: string }[]).find(
      (category) => category.kind === 'expense',
    )!.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Dilnoza Kassir',
        login: 'kassir',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'cashier')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    cashier = await harness.signIn('kassir')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('offers the till what the bank wrote, and sells with it: one notice, one sale', async () => {
    came('150.000,00')
    await heard()
    // The cashier sees how much and when — never what is left on the card.
    const picks = (await cashier.get('/api/card-notices/picks').query({ direction: 'in' }).expect(200)).body
    expect(picks).toEqual([
      {
        id: expect.any(String),
        accountId: cardId,
        direction: 'in',
        amount: som(150_000),
        currency: 'UZS',
        at: '2026-10-11T20:04',
        receivedAt: expect.any(String),
        heading: 'To‘ldirish',
        place: 'ZOOMRAD P2P VISA2HUM',
      },
    ])
    expect((await cashier.get('/api/card-notices/picks').query({ direction: 'out' }).expect(200)).body).toEqual([])
    const [{ id }] = picks

    // The sum must be what the notices make.
    const short = await sell(
      {
        lines: [{ variantId: coat, qty: 1 }],
        payments: [
          { method: 'card', accountId: cardId, amount: som(100_000), noticeIds: [id] },
          { method: 'cash', amount: som(50_000) },
        ],
        total: som(150_000),
      },
      cashier,
    )
    expect(short.status).toBe(400)
    expect(short.body.error.fields['payments.0.noticeIds']).toMatch(
      /^Tanlangan bank xabarlari 150\s000\sso‘m: summa shunga teng bo‘lishi kerak$/,
    )

    const body = {
      lines: [{ variantId: coat, qty: 1 }],
      payments: [{ method: 'card', accountId: cardId, amount: som(150_000), noticeIds: [id] }],
      total: som(150_000),
    }
    const sale = (await sell(body, cashier).expect(201)).body
    expect(await noticeOf(som(150_000))).toMatchObject({
      standing: 'linked',
      linkWay: 'picked',
      document: { type: 'sale', id: sale.id, number: sale.number },
      handledByName: 'Dilnoza Kassir',
    })
    // Picked once, it is no one else's: the list no longer offers it, and a second sale is refused it.
    expect((await cashier.get('/api/card-notices/picks').query({ direction: 'in' }).expect(200)).body).toEqual([])
    const twice = await sell(body, cashier)
    expect(twice.status).toBe(400)
    expect(twice.body.error.fields['payments.0.noticeIds']).toMatch(/boshqa to‘lovga bog‘lab/)
  })

  it('gives a sale’s notice back when the sale is voided', async () => {
    const notice = await noticeOf(som(150_000))
    await alpha.post(`/api/sales/${notice.document!.id}/void`).send({ reason: 'Xato' }).expect(200)
    expect(await noticeOf(som(150_000))).toMatchObject({ standing: 'open', linkWay: null, document: null })
    expect((await notices({ state: 'open' })).summary.open).toBe(1)
  })

  it('ties a notice to the one payment it fits, and leaves two people’s to a person', async () => {
    // Written first, the bank's notice after: tied as it comes.
    const first = (await pay(nodira, som(80_000)).expect(201)).body
    came('80.000,00')
    await heard()
    expect(await noticeOf(som(80_000))).toMatchObject({
      standing: 'linked',
      linkWay: 'auto',
      document: { type: 'customer_payment', id: first.id, who: 'Nodira' },
      handledByName: null,
    })

    // The same sum from two customers: the notice could be either's, and the system does not choose.
    await pay(nodira, som(30_000)).expect(201)
    const anvars = (await pay(anvar, som(30_000)).expect(201)).body
    came('30.000,00')
    await heard()
    const notice = await noticeOf(som(30_000))
    expect(notice.standing).toBe('open')
    const candidates = (await alpha.get(`/api/card-notices/${notice.id}/candidates`).expect(200)).body
    expect(candidates.map((entry: { document: { who: string } }) => entry.document.who).sort()).toEqual([
      'Anvar',
      'Nodira',
    ])
    await cashier
      .post(`/api/card-notices/${notice.id}/match`)
      .send({ documentType: 'customer_payment', documentId: anvars.id })
      .expect(403)
    const matched = (
      await alpha
        .post(`/api/card-notices/${notice.id}/match`)
        .send({ documentType: 'customer_payment', documentId: anvars.id })
        .expect(200)
    ).body as CardNoticeDto
    expect(matched).toMatchObject({ standing: 'linked', linkWay: 'matched', document: { who: 'Anvar' } })
    // Anvar's taken, the next notice of that sum has one payment left to be: Nodira's.
    came('30.000,00', new Date(Date.now() - 1000))
    await heard()
    const tied = (await notices()).items.filter((item) => item.amount === som(30_000))
    expect(tied.map((item) => [item.standing, item.document?.who]).sort()).toEqual([
      ['linked', 'Anvar'],
      ['linked', 'Nodira'],
    ])
    // A document's money is stood for once: no other notice goes on it too.
    const open = await noticeOf(som(150_000))
    const over = await alpha
      .post(`/api/card-notices/${open.id}/match`)
      .send({ documentType: 'customer_payment', documentId: anvars.id })
      .expect(409)
    expect(over.body.error.message).toBe('Bu hujjatning kartadagi puli bank xabarlari bilan yopilgan')
  })

  it('ties a notice that came first to the money written after it', async () => {
    went('25.000,00')
    await heard()
    expect((await noticeOf(som(25_000), 'out')).standing).toBe('open')
    await alpha
      .post('/api/money/ops')
      .send({
        clientKey: randomUUID(),
        kind: 'expense',
        categoryId: kitchen,
        lines: [{ accountId: cardId, amount: som(25_000) }],
        total: som(25_000),
      })
      .expect(201)
    // Tried again once the money has settled, a moment later.
    for (let tries = 0; tries < 20 && (await noticeOf(som(25_000), 'out')).standing === 'open'; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    expect(await noticeOf(som(25_000), 'out')).toMatchObject({
      standing: 'linked',
      linkWay: 'auto',
      document: { type: 'money_op' },
    })
  })

  it('leaves a notice off the books for a reason, and takes it back', async () => {
    const notice = await noticeOf(som(150_000))
    await alpha.post(`/api/card-notices/${notice.id}/dismiss`).send({}).expect(400)
    const dismissed = (
      await alpha.post(`/api/card-notices/${notice.id}/dismiss`).send({ reason: 'Egasining shaxsiy puli' }).expect(200)
    ).body as CardNoticeDto
    expect(dismissed).toMatchObject({ standing: 'dismissed', reason: 'Egasining shaxsiy puli' })
    // Left off, it is offered to no window.
    expect((await alpha.get('/api/card-notices/picks').query({ direction: 'in' }).expect(200)).body).toEqual([])
    const back = (await alpha.post(`/api/card-notices/${notice.id}/reopen`).expect(200)).body as CardNoticeDto
    expect(back).toMatchObject({ standing: 'open', reason: null })
  })

  it('shows money in the books the bank never wrote of, and each card beside its bank', async () => {
    // Nodira's 40 000: written, and the bank has said nothing of it.
    await pay(nodira, som(40_000)).expect(201)
    const entries = (await alpha.get('/api/card-entries').expect(200)).body as {
      document: { type: string; id: string; who: string }
      left: number
      amount: number
    }[]
    const waiting = entries.filter((entry) => entry.left !== 0)
    expect(waiting.map((entry) => [entry.document.who, entry.left])).toEqual([['Nodira', som(40_000)]])
    const key = { documentType: waiting[0].document.type, documentId: waiting[0].document.id, accountId: cardId }
    await alpha
      .post('/api/card-entries/check')
      .send({ ...key, note: 'Bank ilovasida bor' })
      .expect(200)
    expect((await alpha.get('/api/card-entries').expect(200)).body).toEqual([])
    await alpha.post('/api/card-entries/uncheck').send(key).expect(200)
    expect((await alpha.get('/api/card-entries').expect(200)).body).toHaveLength(1)

    const [stand] = (await alpha.get('/api/card-notices/stand').expect(200)).body
    const last = (await notices()).items[0]
    expect(stand).toMatchObject({
      accountId: cardId,
      name: 'Humo',
      bank: { balance: last.balance },
      // In: 80 000, two of 30 000 and 40 000; out: 25 000. The voided sale's money came and went.
      books: som(80_000 + 30_000 + 30_000 + 40_000 - 25_000),
      open: { in: 1, inSum: som(150_000), out: 0, outSum: 0 },
      unconfirmed: 1,
    })
    expect(stand.difference).toBe(stand.bank.balance - stand.booksAtBank)
  })

  it('ties a transfer off the card to its notice, and gives it back when the transfer is turned back', async () => {
    const safeId = (await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf' }).expect(201)).body.id
    went('20.000,00')
    await heard()
    const notice = await noticeOf(som(20_000), 'out')
    const send = (noticeIds: string[]) =>
      alpha.post('/api/money/transfers').send({
        clientKey: randomUUID(),
        fromAccountId: cardId,
        toAccountId: safeId,
        amount: som(20_000),
        noticeIds,
      })
    // A notice of money coming in is not a transfer's going out.
    const wrong = await send([(await noticeOf(som(150_000))).id])
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.fields.noticeIds).toBe('Bank xabari kartaga pul tushganini aytadi')

    const sent = (await send([notice.id]).expect(201)).body
    expect(await noticeOf(som(20_000), 'out')).toMatchObject({
      standing: 'linked',
      linkWay: 'picked',
      document: { type: 'money_transfer', id: sent.id, who: 'Humo → Seyf' },
    })
    await alpha.post(`/api/money/transfers/${sent.id}/reject`).send({ reason: 'Seyfga kelmadi' }).expect(200)
    expect(await noticeOf(som(20_000), 'out')).toMatchObject({ standing: 'open', document: null })
  })
})
