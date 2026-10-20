/**
 * What card control needs of Telegram, and no more: to sign an account in,
 * to find the banks' chats in it, to read them and to hear what is written
 * there. The library that does it (`gram.driver.ts`) stands behind this, so
 * that everything above it is tried against a Telegram of our own making.
 */

import type { TelegramCodeWay } from '@erp/core'

export interface BotChat {
  id: string
  title: string
  username: string | null
}

export interface ChatMessage {
  chatId: string
  id: number
  date: Date
  text: string
}

/** A signed-in account's connection. */
export interface TelegramLink {
  me(): Promise<{ id: string; name: string | null; phone: string | null }>
  /** The chats with bots the account has: which of them are banks' is for the caller to say. */
  botChats(): Promise<BotChat[]>
  /** A chat's messages after `afterId` (or its last `limit`), the oldest first. */
  history(chatId: string, options: { limit: number; afterId?: number }): Promise<ChatMessage[]>
  /** Every new message of any chat, as it comes. */
  listen(handler: (message: ChatMessage) => void): void
  /** Raises a dropped connection again. Throws `SignedOut` where Telegram has ended the session. */
  keepUp(): Promise<void>
  /** Lets the connection go for good: nothing of it keeps running. The session itself stays Telegram's. */
  close(): Promise<void>
  /** Ends the session at Telegram too — it leaves the account's list of devices — and lets the connection go. */
  end(): Promise<void>
}

/** How Telegram sent a code, and the way it offers to send it again (null: none). */
export interface TelegramCodeSent {
  way: TelegramCodeWay
  next: TelegramCodeWay | null
}

/**
 * Signing in by a QR code: still waiting for the account's app to scan it (the link to draw, and until when it
 * holds), scanned by an account that has a two-step password, or done.
 */
export type TelegramScan = { state: 'waiting'; link: string; expires: Date } | { state: 'password' } | { state: 'done' }

/** A sign-in under way: the code Telegram sent, then the account's two-step password where it has one. */
export interface TelegramLogin {
  /** Asks Telegram for the code; it answers how it sent it, and how it would send it again. */
  sendCode(phone: string): Promise<TelegramCodeSent>
  /** The code never came: asks for it again, the next way Telegram offers. */
  resendCode(): Promise<TelegramCodeSent>
  /** Signing in by a QR code instead: how that stands now. Asked again and again until it is scanned. */
  scan(): Promise<TelegramScan>
  /** `password` where the account asks for its second step. */
  signIn(code: string): Promise<'done' | 'password'>
  checkPassword(password: string): Promise<void>
  /** Once signed in: the key its session is kept by, and the connection itself. */
  finish(): Promise<{ session: string; link: TelegramLink }>
  cancel(): Promise<void>
}

export interface TelegramDriver {
  login(): Promise<TelegramLogin>
  open(session: string): Promise<TelegramLink>
}

/** Telegram has ended the session: the account's owner closed it, or the account is gone. */
export class SignedOut extends Error {
  constructor() {
    super('Telegram has ended the session')
  }
}

export type RefusalCode = 'phone' | 'code' | 'code_expired' | 'password' | 'flood' | 'no_other_way' | 'other'

/** Telegram would not have what was sent: a wrong number, code or password, or too many tries. */
export class TelegramRefusal extends Error {
  constructor(
    readonly code: RefusalCode,
    /** For `flood`: how long Telegram asks to wait, in seconds. */
    readonly seconds = 0,
    message: string = code,
  ) {
    super(message)
  }
}
