import { randomUUID } from 'node:crypto'

import {
  BANK_BOTS,
  bankBotOf,
  type TelegramAccountDto,
  type TelegramLoginCodeInput,
  type TelegramLoginPasswordInput,
  type TelegramLoginQrInput,
  type TelegramLoginReady,
  type TelegramLoginResendInput,
  type TelegramLoginStartInput,
  type TelegramLoginStep,
  type TelegramSetupDto,
} from '@erp/core'
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import type { Env } from '../../config/env'
import { Db } from '../../database/db.service'
import { TelegramAccount } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { CardNoticesService } from './card-notices.service'
import {
  SignedOut,
  TelegramRefusal,
  type ChatMessage,
  type TelegramCodeSent,
  type TelegramLink,
  type TelegramLogin,
  type TelegramScan,
} from './telegram.driver'
import { TelegramGateway } from './telegram.gateway'

/** How often each bank's chat is read again, in case a message that came live was missed. */
const SWEEP_EVERY_MS = 5 * 60_000
/** How often each connection is looked at; a dropped one is raised again and its chats read at once. */
const WATCH_EVERY_MS = 60_000
/** How much of a chat is read at once. Messages already kept are known by where they came from. */
const SWEEP_LIMIT = 100
/** How much of a bank's chat is read when its account is first signed in. */
const FIRST_READ = 200
/** How often, at most, a message of an unknown chat sends the account to look for a bank's bot started since. */
const LOOK_EVERY_MS = 10_000
/** How long a sign-in may stand between its steps. */
const LOGIN_TTL_MS = 10 * 60_000

interface Chat {
  id: string
  title: string
  /** The last message of it that was read. */
  lastId?: number
}

interface Open {
  orgId: string
  link: TelegramLink
}

interface Pending {
  orgId: string
  userId: string
  phone: string
  login: TelegramLogin
  /**
   * `phone`: a connection made ready as the window opened, with no number typed into it yet; `qr`: a QR code is
   * on the screen, waiting to be scanned.
   */
  step: 'phone' | 'qr' | 'code' | 'password'
  at: number
}

/**
 * The Telegram accounts a business reads its banks' notices from (KEYINGI-REJA, 18-bo'lim).
 *
 * An account is signed into from here in three steps — the number, the code Telegram sends, the two-step
 * password where there is one — each typed by the account's owner. Neither the code nor the password is kept:
 * only the key of the session they open, sealed. From then on the account's chats with the banks' bots — those
 * alone — are read as messages come, read again every few minutes in case one was missed, and read from where
 * they were left when the server comes back up. Nothing is ever sent.
 */
@Injectable()
export class TelegramAccountsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAccountsService.name)
  private readonly open = new Map<string, Open>()
  private readonly pending = new Map<string, Pending>()
  private readonly busy = new Set<string>()
  /** When a message last sent each account to look through its chats, and the chats found to be nobody's. */
  private readonly lookedAt = new Map<string, number>()
  private readonly strangers = new Map<string, Set<string>>()
  private timers: NodeJS.Timeout[] = []

  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly gateway: TelegramGateway,
    private readonly notices: CardNoticesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap() {
    // A test raises what it needs itself; nothing reaches for Telegram on its own there. Nor does a command
    // run beside the server (migrate, seed): one account signed in twice at once is asking Telegram to end both.
    if (this.config.get('NODE_ENV') === 'test' || process.env.ERP_CLI === '1' || !this.gateway.configured) {
      return
    }
    void this.raiseAll()
    this.timers = [
      setInterval(() => void this.sweepAll(), SWEEP_EVERY_MS),
      setInterval(() => void this.watchAll(), WATCH_EVERY_MS),
    ]
  }

  async onModuleDestroy() {
    this.timers.forEach(clearInterval)
    for (const { login } of this.pending.values()) {
      await login.cancel()
    }
    for (const { link } of this.open.values()) {
      await link.close()
    }
    this.pending.clear()
    this.open.clear()
  }

  // ───────────────────────────── For the screen ─────────────────────────────

  async setup(actor: Actor): Promise<TelegramSetupDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => ({
      configured: this.gateway.configured,
      accounts: (await em.find(TelegramAccount, { order: { createdAt: 'ASC' } })).map(toDto),
    }))
  }

  /**
   * Before the first step: a connection to Telegram is raised as the window opens, so that the second or two it
   * takes pass while the number is typed. One to a person: a window opened again takes the place of the last.
   */
  async prepare(actor: Actor): Promise<TelegramLoginReady> {
    if (!this.gateway.configured) {
      throw AppError.badRequest('TELEGRAM_NOT_CONFIGURED', 'Serverda Telegram ilovasi kalitlari yozilmagan')
    }
    this.forgetStale()
    for (const [id, pending] of this.pending) {
      if (pending.step === 'phone' && pending.orgId === actor.orgId && pending.userId === actor.userId) {
        this.pending.delete(id)
        void pending.login.cancel()
      }
    }
    const login = await this.asked(async () => (await this.gateway.way()).login(), 'phone')
    const loginId = randomUUID()
    this.pending.set(loginId, {
      orgId: actor.orgId,
      userId: actor.userId,
      phone: '',
      login,
      step: 'phone',
      at: Date.now(),
    })
    return { loginId }
  }

  /** The window was closed before anyone signed in: the connection made for it is let go. */
  async abandon(actor: Actor, loginId: string): Promise<void> {
    const pending = this.pending.get(loginId)
    if (pending && pending.orgId === actor.orgId && pending.userId === actor.userId) {
      this.pending.delete(loginId)
      await pending.login.cancel()
    }
  }

  /** The first step: Telegram sends its code to the account's own app. */
  async start(actor: Actor, input: TelegramLoginStartInput): Promise<TelegramLoginStep> {
    if (!this.gateway.configured) {
      throw AppError.badRequest('TELEGRAM_NOT_CONFIGURED', 'Serverda Telegram ilovasi kalitlari yozilmagan')
    }
    this.forgetStale()
    // The connection made ready while the number was typed, where there is one still; else one is raised now.
    const ready = input.loginId ? this.pending.get(input.loginId) : undefined
    const kept =
      ready &&
      (ready.step === 'phone' || ready.step === 'qr') &&
      ready.orgId === actor.orgId &&
      ready.userId === actor.userId
        ? ready
        : null
    const began = Date.now()
    const login = kept?.login ?? (await this.asked(async () => (await this.gateway.way()).login(), 'phone'))
    let sent: TelegramCodeSent
    try {
      sent = await this.asked(() => login.sendCode(input.phone), 'phone')
    } catch (error) {
      // A number Telegram would not have is typed again over the same connection; anything else ends it.
      if (!kept || !(error instanceof AppError)) {
        if (kept && input.loginId) {
          this.pending.delete(input.loginId)
        }
        await login.cancel()
      }
      throw error
    }
    // Whose number it was is not written down; how the code went is what a "the code never came" is answered by.
    this.logger.log(
      `Telegram sent a sign-in code by: ${sent.way}; would send it again by: ${sent.next ?? 'nothing'}; ` +
        `asked in ${Date.now() - began} ms over a connection ${kept ? 'made ready' : 'raised now'}`,
    )
    const loginId = kept && input.loginId ? input.loginId : randomUUID()
    this.pending.set(loginId, {
      orgId: actor.orgId,
      userId: actor.userId,
      phone: input.phone,
      login,
      step: 'code',
      at: Date.now(),
    })
    return { loginId, step: 'code', account: null, sentBy: sent.way, nextBy: sent.next }
  }

  /**
   * Signing in with no number and no code: a QR code for the account's own Telegram app to scan. The window asks
   * again every couple of seconds; the answer is the code still to show, the two-step password to ask for, or
   * the account, signed in. Whose account it is is whoever scans — the one with the banks' bots on that telephone.
   */
  async qr(actor: Actor, input: TelegramLoginQrInput): Promise<TelegramLoginStep> {
    if (!this.gateway.configured) {
      throw AppError.badRequest('TELEGRAM_NOT_CONFIGURED', 'Serverda Telegram ilovasi kalitlari yozilmagan')
    }
    this.forgetStale()
    const ready = input.loginId ? this.pending.get(input.loginId) : undefined
    const kept =
      ready &&
      (ready.step === 'phone' || ready.step === 'qr') &&
      ready.orgId === actor.orgId &&
      ready.userId === actor.userId
        ? ready
        : null
    const loginId = kept && input.loginId ? input.loginId : randomUUID()
    const pending: Pending = kept ?? {
      orgId: actor.orgId,
      userId: actor.userId,
      phone: '',
      login: await this.asked(async () => (await this.gateway.way()).login(), 'code'),
      step: 'qr',
      at: Date.now(),
    }
    let scan: TelegramScan
    try {
      scan = await this.asked(() => pending.login.scan(), 'code')
    } catch (error) {
      this.pending.delete(loginId)
      await pending.login.cancel()
      throw error
    }
    // Asked about again and again while the window is open: it does not go stale under the person's eyes.
    pending.at = Date.now()
    this.pending.set(loginId, pending)
    if (scan.state === 'waiting') {
      pending.step = 'qr'
      return { loginId, step: 'qr', account: null, qr: { link: scan.link, expiresAt: scan.expires.toISOString() } }
    }
    this.logger.log(
      `Telegram: a QR code was scanned; ${scan.state === 'password' ? 'the two-step password is next' : 'signed in'}`,
    )
    if (scan.state === 'password') {
      pending.step = 'password'
      return { loginId, step: 'password', account: null }
    }
    return this.finish(actor, loginId, pending)
  }

  /** The code never came: Telegram is asked to send it again, the next way it has (an SMS, usually). */
  async resend(actor: Actor, input: TelegramLoginResendInput): Promise<TelegramLoginStep> {
    const pending = this.pendingOf(actor, input.loginId)
    if (pending.step !== 'code') {
      throw AppError.validation({ code: 'Kod allaqachon qabul qilingan' })
    }
    const sent = await this.asked(() => pending.login.resendCode(), 'code')
    pending.at = Date.now()
    this.logger.log(
      `Telegram sent a sign-in code again by: ${sent.way}; would send it again by: ${sent.next ?? 'nothing'}`,
    )
    return { loginId: input.loginId, step: 'code', account: null, sentBy: sent.way, nextBy: sent.next }
  }

  /** The second step: the code. Where the account has a two-step password, that is asked for next. */
  async code(actor: Actor, input: TelegramLoginCodeInput): Promise<TelegramLoginStep> {
    const pending = this.pendingOf(actor, input.loginId)
    const next = await this.asked(() => pending.login.signIn(input.code), 'code')
    if (next === 'password') {
      pending.step = 'password'
      pending.at = Date.now()
      return { loginId: input.loginId, step: 'password', account: null }
    }
    return this.finish(actor, input.loginId, pending)
  }

  /** The third step, where there is one: the password, checked and forgotten. */
  async password(actor: Actor, input: TelegramLoginPasswordInput): Promise<TelegramLoginStep> {
    const pending = this.pendingOf(actor, input.loginId)
    if (pending.step !== 'password') {
      throw AppError.validation({ password: 'Avval Telegram yuborgan kodni kiriting' })
    }
    await this.asked(() => pending.login.checkPassword(input.password), 'password')
    return this.finish(actor, input.loginId, pending)
  }

  /** Raises an account's connection again and reads what came meanwhile. */
  async reconnect(actor: Actor, id: string): Promise<TelegramAccountDto> {
    await this.accountOf(actor, id)
    await this.drop(id)
    await this.raise(id)
    await this.sweep(id)
    return this.accountOf(actor, id)
  }

  /** Reads an account's chats again now. */
  async readNow(actor: Actor, id: string): Promise<TelegramAccountDto> {
    await this.accountOf(actor, id)
    if (!this.open.has(id)) {
      await this.raise(id)
    }
    await this.sweep(id)
    return this.accountOf(actor, id)
  }

  /** Stops reading an account and throws its session's key away. What it had read stays. */
  async switchOff(actor: Actor, id: string): Promise<TelegramAccountDto> {
    // Off is off at Telegram too: the session leaves the account's devices, where it would otherwise stand for good.
    const held = this.open.get(id)
    this.open.delete(id)
    await held?.link.end()
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const account = await this.find(em, id)
      await em.update(TelegramAccount, id, { status: 'off', session: null, error: null })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'telegram_account.off',
        entity: 'telegram_account',
        entityId: id,
        summary: account.phone,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['telegram-accounts']))
      return toDto({ ...account, status: 'off', session: null, error: null })
    })
  }

  // ───────────────────────────── Reading ─────────────────────────────

  /**
   * Reads an account's banks' chats from where each was left — or, a chat read for the first time, its last
   * messages. Returns how many notices were new.
   */
  async sweep(id: string): Promise<number> {
    const held = this.open.get(id)
    if (!held || this.busy.has(id)) {
      return 0
    }
    this.busy.add(id)
    try {
      let chats = await this.chatsOf(held.orgId, id)
      // An account may be signed in before it has ever written to a bank's bot — or to one of the two. The bot
      // started later is found here, with no new sign-in.
      if (chats.length < BANK_BOTS.length) {
        chats = await this.learnChats(id, held, chats)
      }
      let found = 0
      let last: Date | null = null
      for (const chat of chats) {
        const messages = await held.link.history(chat.id, {
          limit: chat.lastId ? SWEEP_LIMIT : FIRST_READ,
          afterId: chat.lastId,
        })
        for (const message of messages) {
          if (await this.take(held.orgId, id, chat, message)) {
            found++
          }
          chat.lastId = Math.max(chat.lastId ?? 0, message.id)
          last = message.date
        }
      }
      await this.db.tenant(held.orgId, async ({ em, afterCommit }) => {
        await em.update(TelegramAccount, id, {
          chats,
          status: 'connected',
          error: null,
          lastSeenAt: new Date(),
          ...(last ? { lastNoticeAt: last } : {}),
        })
        afterCommit(() => this.realtime.changed(held.orgId, ['telegram-accounts']))
      })
      return found
    } catch (error) {
      await this.failed(held.orgId, id, error)
      return 0
    } finally {
      this.busy.delete(id)
    }
  }

  // ───────────────────────────── Inside ─────────────────────────────

  private async finish(actor: Actor, loginId: string, pending: Pending): Promise<TelegramLoginStep> {
    this.pending.delete(loginId)
    const { session, link } = await pending.login.finish()
    const me = await link.me()
    const chats = await this.bankChats(link)
    const account = await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      // Signed in by a QR code, no number was typed: the account says its own.
      const phone = me.phone ?? (pending.phone || `Telegram ${me.id}`)
      const known = await em.findOneBy(TelegramAccount, { phone })
      const fields = {
        name: me.name,
        telegramId: me.id,
        session: this.gateway.seal(session),
        status: 'connected' as const,
        // A chat read before keeps its place: signing in again does not read it all over.
        chats: chats.map((chat) => ({
          ...chat,
          lastId: (known?.chats as Chat[] | undefined)?.find((was) => was.id === chat.id)?.lastId,
        })),
        error: null,
        lastSeenAt: new Date(),
      }
      const id = known
        ? known.id
        : (
            await em.save(
              em.create(TelegramAccount, {
                orgId: actor.orgId,
                phone,
                ...fields,
                createdBy: actor.userId,
                createdByName: actor.name,
              }),
            )
          ).id
      if (known) {
        await em.update(TelegramAccount, id, fields)
      }
      await this.audit.record(em, actor.orgId, actor, {
        action: 'telegram_account.connect',
        entity: 'telegram_account',
        entityId: id,
        summary: `${phone}${chats.length ? `: ${chats.map((chat) => chat.title).join(', ')}` : ''}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['telegram-accounts']))
      return this.find(em, id)
    })
    await this.drop(account.id)
    this.hold(account.id, actor.orgId, link)
    await this.sweep(account.id)
    return { loginId, step: 'done', account: await this.accountOf(actor, account.id) }
  }

  /** The account's chats with banks' bots, and no other. */
  private async bankChats(link: TelegramLink): Promise<Chat[]> {
    return (await link.botChats()).filter((chat) => bankBotOf(chat)).map((chat) => ({ id: chat.id, title: chat.title }))
  }

  private hold(id: string, orgId: string, link: TelegramLink) {
    this.open.set(id, { orgId, link })
    link.listen((message) => void this.heard(id, message))
  }

  /** A message as it comes: kept where it is of a bank's chat, passed over where it is of any other. */
  private async heard(id: string, message: ChatMessage) {
    const held = this.open.get(id)
    if (!held) {
      return
    }
    try {
      let chats = await this.chatsOf(held.orgId, id)
      // A chat the account did not have when it was signed in may be a bank's bot started since: its first
      // message is the moment to look. A chat found to be nobody's is not asked about again, and a burst of
      // strangers sends it looking once: whatever that misses, the next reading of the chats finds.
      const strangers = this.strangers.get(id) ?? new Set<string>()
      this.strangers.set(id, strangers)
      const unknown = !chats.some((item) => item.id === message.chatId) && !strangers.has(message.chatId)
      if (unknown && chats.length < BANK_BOTS.length && Date.now() - (this.lookedAt.get(id) ?? 0) > LOOK_EVERY_MS) {
        this.lookedAt.set(id, Date.now())
        chats = await this.learnChats(id, held, chats)
        if (!chats.some((item) => item.id === message.chatId)) {
          strangers.add(message.chatId)
        }
      }
      const chat = chats.find((item) => item.id === message.chatId)
      if (chat) {
        await this.take(held.orgId, id, chat, message)
      }
    } catch (error) {
      this.logger.warn(`a notice could not be kept: ${(error as Error).message}`)
    }
  }

  /** Looks through the account's chats again for banks' bots, and keeps those it did not have. */
  private async learnChats(id: string, held: Open, known: Chat[]): Promise<Chat[]> {
    const found = await this.bankChats(held.link)
    const chats = found.map((chat) => ({ ...chat, lastId: known.find((was) => was.id === chat.id)?.lastId }))
    if (chats.length !== known.length || chats.some((chat) => !known.some((was) => was.id === chat.id))) {
      await this.db.tenant(held.orgId, async ({ em, afterCommit }) => {
        await em.update(TelegramAccount, id, { chats })
        afterCommit(() => this.realtime.changed(held.orgId, ['telegram-accounts']))
      })
    }
    return chats
  }

  private take(orgId: string, id: string, chat: Chat, message: ChatMessage): Promise<boolean> {
    return this.notices.take(orgId, {
      source: 'telegram',
      sourceKey: `tg:${id}:${chat.id}:${message.id}`,
      telegramAccountId: id,
      bot: chat.title,
      receivedAt: message.date,
      text: message.text,
    })
  }

  /** Opens a kept account's connection from its sealed session. */
  private async raise(id: string): Promise<void> {
    const account = await this.db.system((em) => em.findOneBy(TelegramAccount, { id }))
    if (!account?.session) {
      return
    }
    const session = this.gateway.open(account.session)
    try {
      if (!session) {
        throw new SignedOut()
      }
      const link = await (await this.gateway.way()).open(session)
      this.hold(id, account.orgId, link)
      // A bank's bot written to since the account was signed in is read from now on.
      const chats = await this.bankChats(link)
      const known = account.chats as Chat[]
      await this.db.tenant(account.orgId, ({ em }) =>
        em.update(TelegramAccount, id, {
          chats: chats.map((chat) => ({ ...chat, lastId: known.find((was) => was.id === chat.id)?.lastId })),
        }),
      )
    } catch (error) {
      await this.failed(account.orgId, id, error)
    }
  }

  private async drop(id: string) {
    const held = this.open.get(id)
    this.open.delete(id)
    await held?.link.close()
  }

  /** What went wrong is written on the account: a session Telegram ended asks for a new sign-in, anything else is tried again. */
  private async failed(orgId: string, id: string, error: unknown) {
    const out = error instanceof SignedOut
    if (out) {
      await this.drop(id)
    }
    this.logger.warn(`telegram account ${id}: ${(error as Error).message}`)
    await this.db.tenant(orgId, async ({ em, afterCommit }) => {
      await em.update(TelegramAccount, id, {
        status: out ? 'signed_out' : 'offline',
        ...(out ? { session: null } : {}),
        error: out ? 'Telegram sessiyani yopgan: akkauntga qayta kirish kerak' : (error as Error).message.slice(0, 300),
      })
      afterCommit(() => this.realtime.changed(orgId, ['telegram-accounts']))
    })
  }

  private async raiseAll() {
    const accounts = await this.db.system((em) =>
      em.query(`SELECT id FROM telegram_accounts WHERE session IS NOT NULL AND status <> 'off'`),
    )
    for (const { id } of accounts as { id: string }[]) {
      await this.raise(id)
      await this.sweep(id)
    }
  }

  private async sweepAll() {
    for (const id of [...this.open.keys()]) {
      await this.sweep(id)
    }
  }

  private async watchAll() {
    // A connection made ready for a window nobody signed in through is not kept for ever.
    this.forgetStale()
    // An account whose connection could not be raised is tried again; one that is up is asked if it still is.
    const down = await this.db.system((em) =>
      em.query(`SELECT id FROM telegram_accounts WHERE session IS NOT NULL AND status = 'offline'`),
    )
    for (const { id } of down as { id: string }[]) {
      if (!this.open.has(id)) {
        await this.raise(id)
        await this.sweep(id)
      }
    }
    for (const [id, held] of [...this.open]) {
      try {
        await held.link.keepUp()
      } catch (error) {
        await this.failed(held.orgId, id, error)
      }
    }
  }

  private chatsOf(orgId: string, id: string): Promise<Chat[]> {
    return this.db.tenant(orgId, async ({ em }) =>
      ((await this.find(em, id)).chats as Chat[]).map((chat) => ({ ...chat })),
    )
  }

  private async find(em: EntityManager, id: string): Promise<TelegramAccount> {
    const account = await em.findOneBy(TelegramAccount, { id })
    if (!account) {
      throw AppError.notFound('Telegram akkaunt topilmadi')
    }
    return account
  }

  private accountOf(actor: Actor, id: string): Promise<TelegramAccountDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => toDto(await this.find(em, id)))
  }

  private pendingOf(actor: Actor, loginId: string): Pending {
    this.forgetStale()
    const pending = this.pending.get(loginId)
    // One only made ready, or waiting to be scanned, has had no code asked for: there is nothing to carry on.
    if (
      !pending ||
      pending.step === 'phone' ||
      pending.step === 'qr' ||
      pending.orgId !== actor.orgId ||
      pending.userId !== actor.userId
    ) {
      throw AppError.badRequest('LOGIN_EXPIRED', 'Kirish vaqti o‘tdi: telefon raqamidan qayta boshlang')
    }
    return pending
  }

  private forgetStale() {
    for (const [id, pending] of this.pending) {
      if (Date.now() - pending.at > LOGIN_TTL_MS) {
        this.pending.delete(id)
        void pending.login.cancel()
      }
    }
  }

  /** What Telegram would not have, said under the field it was typed into. */
  private async asked<T>(work: () => Promise<T>, field: 'phone' | 'code' | 'password'): Promise<T> {
    try {
      return await work()
    } catch (error) {
      if (!(error instanceof TelegramRefusal)) {
        throw error
      }
      const words: Record<TelegramRefusal['code'], string> = {
        phone: 'Telegram bu raqamni qabul qilmadi',
        code: 'Kod noto‘g‘ri',
        code_expired: 'Kod eskirgan: telefon raqamidan qayta boshlang',
        password: 'Parol noto‘g‘ri',
        flood: `Telegram vaqtincha to‘xtatdi: ${Math.max(1, Math.ceil(error.seconds / 60))} daqiqadan keyin urinib ko‘ring`,
        no_other_way:
          'Telegram kodni boshqa yo‘l bilan yubormaydi. Kod shu raqam ochiq turgan Telegram ilovasiga keladi',
        other: `Telegram rad etdi: ${error.message}`,
      }
      throw AppError.validation({ [field]: words[error.code] }, words[error.code])
    }
  }
}

function toDto(account: TelegramAccount): TelegramAccountDto {
  return {
    id: account.id,
    phone: account.phone,
    name: account.name,
    status: account.status,
    chats: (account.chats as Chat[]).map(({ id, title }) => ({ id, title })),
    lastNoticeAt: account.lastNoticeAt?.toISOString() ?? null,
    lastSeenAt: account.lastSeenAt?.toISOString() ?? null,
    error: account.error,
    createdAt: account.createdAt.toISOString(),
  }
}
