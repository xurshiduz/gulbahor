import type { TelegramCodeWay } from '@erp/core'
import { Api, TelegramClient } from 'telegram'
import { NewMessage, type NewMessageEvent } from 'telegram/events'
import { LogLevel } from 'telegram/extensions/Logger'
import { computeCheck } from 'telegram/Password'
import { StringSession } from 'telegram/sessions'

import {
  SignedOut,
  TelegramRefusal,
  type BotChat,
  type ChatMessage,
  type TelegramCodeSent,
  type TelegramDriver,
  type TelegramLink,
  type TelegramLogin,
  type TelegramScan,
} from './telegram.driver'

/**
 * Telegram itself, through GramJS. Loaded only where the server has the keys
 * of a Telegram app (`TelegramGateway`), so that nothing else — the tests
 * among it — pays for the library.
 *
 * Some networks let a plain socket through but stop Telegram's own protocol
 * on it; the websocket on 443 looks like ordinary web traffic and gets past.
 */
const OPTIONS = { connectionRetries: 20, autoReconnect: true, retryDelay: 5_000, useWSS: true }

/** What Telegram calls its errors, read as what card control can do about them. */
function refusal(error: unknown): Error {
  const name = String((error as { errorMessage?: string }).errorMessage ?? (error as Error).message ?? '')
  const seconds = Number((error as { seconds?: number }).seconds ?? 0)
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|AUTH_KEY_DUPLICATED/.test(name)) {
    return new SignedOut()
  }
  if (/PHONE_NUMBER_INVALID|PHONE_NUMBER_BANNED|PHONE_NUMBER_UNOCCUPIED/.test(name)) {
    return new TelegramRefusal('phone', 0, name)
  }
  if (/PHONE_CODE_EXPIRED/.test(name)) {
    return new TelegramRefusal('code_expired', 0, name)
  }
  if (/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/.test(name)) {
    return new TelegramRefusal('code', 0, name)
  }
  if (/PASSWORD_HASH_INVALID/.test(name)) {
    return new TelegramRefusal('password', 0, name)
  }
  if (/FLOOD/.test(name)) {
    return new TelegramRefusal('flood', seconds, name)
  }
  if (/SEND_CODE_UNAVAILABLE/.test(name)) {
    return new TelegramRefusal('no_other_way', 0, name)
  }
  return new TelegramRefusal('other', 0, name || 'Telegram')
}

/**
 * How long a request may go unanswered. A connection that went quiet without an error leaves GramJS waiting for
 * ever: the account stayed busy, no sweep ran and notices came hours late, all at once at the next sign-in.
 */
const ASK_TIMEOUT_MS = 60_000

const asked = async <T>(work: () => Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('TIMEOUT: Telegram did not answer')), ASK_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    throw refusal(error)
  } finally {
    clearTimeout(timer)
  }
}

/** How Telegram says it sent a code, read as what the person is to look at. */
function codeWay(type: unknown): TelegramCodeWay {
  const name = String((type as { className?: string } | null)?.className ?? '')
  if (/SentCodeTypeApp/.test(name)) {
    return 'app'
  }
  if (/Sms/.test(name)) {
    return 'sms'
  }
  if (/Call/.test(name)) {
    return 'call'
  }
  return /EmailCode/.test(name) ? 'email' : 'other'
}

/** What Telegram answers to a code asked for: how it went, and how it would go the next time. */
function codeSent(sent: Api.auth.SentCode): TelegramCodeSent {
  return { way: codeWay(sent.type), next: sent.nextType ? codeWay(sent.nextType) : null }
}

/**
 * Lets a client go for good. `disconnect` alone does not: the library's own loop goes on pinging, takes the
 * silence for a dropped line and raises the connection again — an account switched off would still be read.
 */
const letGo = async (client: TelegramClient) => {
  await client.destroy().catch(() => undefined)
}

function linkOf(client: TelegramClient): TelegramLink {
  return {
    me: () =>
      asked(async () => {
        const me = await client.getMe()
        return {
          id: String(me.id),
          name: [me.firstName, me.lastName].filter(Boolean).join(' ') || null,
          phone: me.phone ? `+${me.phone}` : null,
        }
      }),
    botChats: () =>
      asked(async () => {
        const dialogs = await client.getDialogs({ limit: 300 })
        const chats: BotChat[] = []
        for (const dialog of dialogs) {
          const entity = dialog.entity
          if (entity instanceof Api.User && entity.bot && dialog.id) {
            chats.push({ id: String(dialog.id), title: dialog.title ?? '', username: entity.username ?? null })
          }
        }
        return chats
      }),
    history: (chatId, { limit, afterId }) =>
      asked(async () => {
        const messages = await client.getMessages(chatId, { limit, ...(afterId ? { minId: afterId } : {}) })
        return [...messages]
          .reverse()
          .filter((message) => !!message.message)
          .map((message): ChatMessage => ({
            chatId,
            id: message.id,
            date: new Date(message.date * 1000),
            text: message.message,
          }))
      }),
    listen: (handler) => {
      client.addEventHandler((event: NewMessageEvent) => {
        const chatId = event.message.chatId?.toString()
        if (chatId && event.message.message) {
          handler({
            chatId,
            id: event.message.id,
            date: new Date(event.message.date * 1000),
            text: event.message.message,
          })
        }
      }, new NewMessage({}))
    },
    keepUp: () =>
      asked(async () => {
        // GramJS gives up after its retries and stays down until it is asked again; while it is still trying
        // on its own it is left alone.
        const sender = client._sender
        if (!client.connected && !sender?.isConnecting && !sender?.isReconnecting) {
          await client.connect()
        }
        // The cheapest question there is: an ended session is told here, not at the next message.
        await client.getMe()
      }),
    close: () => letGo(client),
    end: async () => {
      // Best effort: a session Telegram has already ended, or a line that is down, is let go all the same.
      await client.invoke(new Api.auth.LogOut()).catch(() => undefined)
      await letGo(client)
    },
  }
}

export function gramDriver(apiId: number, apiHash: string): TelegramDriver {
  /**
   * The data centre the last account lives in. A code asked for elsewhere is sent on to the account's own, which
   * means a second connection and a second or two more; a business's numbers live in one place as a rule, so
   * the next sign-in is raised there straight away.
   */
  let home: number | null = null
  const client = async (session: string) => {
    const made = new TelegramClient(new StringSession(session), apiId, apiHash, OPTIONS)
    made.setLogLevel(LogLevel.ERROR)
    await asked(() => made.connect())
    return made
  }

  return {
    async open(session) {
      const made = await client(session)
      home ??= made.session.dcId
      const link = linkOf(made)
      // A session that Telegram has ended connects all the same: it is the first question that tells.
      await link.keepUp()
      return link
    },

    async login(): Promise<TelegramLogin> {
      let made = await client('')
      if (home && made.session.dcId !== home) {
        try {
          // The library's own move, the one it makes when Telegram sends a request on.
          await made._switchDC(home)
        } catch {
          await letGo(made)
          made = await client('')
        }
      }
      let phone = ''
      let hash = ''
      // Signing in by a QR code: the one on the screen, and whether the account's app has said it was scanned.
      let shown: { link: string; expires: number; askedAt: number } | null = null
      let scanned = false
      let listening = false
      return {
        async scan(): Promise<TelegramScan> {
          if (!listening) {
            listening = true
            // Telegram says so on this same connection the moment the code is scanned and allowed.
            made.addEventHandler((update: unknown) => {
              if (update instanceof Api.UpdateLoginToken) {
                scanned = true
              }
            })
          }
          // Telegram is asked at once when it says the code was scanned, and every few seconds besides — should
          // that word ever not come. Until the code runs out, asking again gives the same one.
          if (!scanned && shown && Date.now() - shown.askedAt < 5_000 && shown.expires - Date.now() / 1000 > 5) {
            return { state: 'waiting', link: shown.link, expires: new Date(shown.expires * 1000) }
          }
          try {
            const ask = () => made.invoke(new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] }))
            let answer = await ask()
            if (answer instanceof Api.auth.LoginTokenMigrateTo) {
              // The account lives in another data centre: the sign-in is carried there.
              await made._switchDC(answer.dcId)
              answer = await made.invoke(new Api.auth.ImportLoginToken({ token: answer.token }))
            }
            if (answer instanceof Api.auth.LoginTokenSuccess) {
              home = made.session.dcId
              return { state: 'done' }
            }
            if (!(answer instanceof Api.auth.LoginToken)) {
              throw new TelegramRefusal('other', 0, 'Telegram')
            }
            scanned = false
            shown = {
              link: `tg://login?token=${answer.token.toString('base64url')}`,
              expires: answer.expires,
              askedAt: Date.now(),
            }
            return { state: 'waiting', link: shown.link, expires: new Date(shown.expires * 1000) }
          } catch (error) {
            if (/SESSION_PASSWORD_NEEDED/.test(String((error as { errorMessage?: string }).errorMessage))) {
              home = made.session.dcId
              return { state: 'password' }
            }
            throw error instanceof TelegramRefusal ? error : refusal(error)
          }
        },
        async sendCode(number) {
          phone = number
          // Asked for directly, not through the library's helper: that one forgets how the code was sent.
          const ask = () =>
            made.invoke(
              new Api.auth.SendCode({ phoneNumber: number, apiId, apiHash, settings: new Api.CodeSettings({}) }),
            )
          const sent = await asked(() =>
            ask().catch((error: unknown) => {
              // Telegram asks for the question again while it moves the sign-in between its centres.
              if ((error as { errorMessage?: string }).errorMessage === 'AUTH_RESTART') {
                return ask()
              }
              throw error
            }),
          )
          if (!(sent instanceof Api.auth.SentCode)) {
            throw new TelegramRefusal('other', 0, 'Telegram')
          }
          hash = sent.phoneCodeHash
          home = made.session.dcId
          return codeSent(sent)
        },
        async resendCode() {
          const sent = await asked(() =>
            made.invoke(new Api.auth.ResendCode({ phoneNumber: phone, phoneCodeHash: hash })),
          )
          if (!(sent instanceof Api.auth.SentCode)) {
            throw new TelegramRefusal('other', 0, 'Telegram')
          }
          hash = sent.phoneCodeHash
          return codeSent(sent)
        },
        async signIn(code) {
          try {
            await made.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash: hash, phoneCode: code }))
            return 'done'
          } catch (error) {
            if (/SESSION_PASSWORD_NEEDED/.test(String((error as { errorMessage?: string }).errorMessage))) {
              return 'password'
            }
            throw refusal(error)
          }
        },
        async checkPassword(password) {
          await asked(async () => {
            const asks = await made.invoke(new Api.account.GetPassword())
            await made.invoke(new Api.auth.CheckPassword({ password: await computeCheck(asks, password) }))
          })
        },
        async finish() {
          return { session: String(made.session.save()), link: linkOf(made) }
        },
        cancel: () => letGo(made),
      }
    },
  }
}
