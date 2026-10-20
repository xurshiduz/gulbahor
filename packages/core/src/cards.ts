import { z } from 'zod'

import type { AnyCurrency } from './money'
import { idSchema, listQuerySchema, optionalText, requiredText } from './schemas'

/**
 * Card control (KEYINGI-REJA, 18-bo'lim): what the banks' bots wrote about
 * the business's cards, kept as it came and as it was read. A notice moves
 * no money in the books by itself — it is evidence that money moved on the
 * card, to be set beside what the system says of it.
 */

/** `move` — money came or went; `balance` — the bot's answer to "what is on the card"; `unread` — kept, not understood. */
export const CARD_NOTICE_KINDS = ['move', 'balance', 'unread'] as const
export type CardNoticeKind = (typeof CARD_NOTICE_KINDS)[number]

/**
 * Where a notice of money moving stands: `open` — nobody has said yet what the money was; `linked` — tied to the
 * document that wrote that money in the books; `dismissed` — knowingly left off the books, with the reason.
 */
export const CARD_NOTICE_STANDINGS = ['open', 'linked', 'dismissed'] as const
export type CardNoticeStanding = (typeof CARD_NOTICE_STANDINGS)[number]

/**
 * How a notice came to be tied: `picked` from the list as the money was written; `auto` — tied by the system,
 * one document fitting it to the tiyin; `matched` — by a person, to money written before the notice came.
 */
export const CARD_LINK_WAYS = ['picked', 'auto', 'matched'] as const
export type CardLinkWay = (typeof CARD_LINK_WAYS)[number]

/** The documents that move a card's money. */
export const CARD_DOCUMENT_TYPES = ['sale', 'sale_return', 'customer_payment', 'money_op', 'money_transfer'] as const
export type CardDocumentType = (typeof CARD_DOCUMENT_TYPES)[number]

/** A document as a list names it: its number and whose it is — a customer, an expense's kind, the two places. */
export interface CardDocumentRef {
  type: CardDocumentType
  id: string
  number: string | null
  who: string | null
}

/** Read from a Telegram account's chat with the bot, or put in by hand by someone who may. */
export const CARD_NOTICE_SOURCES = ['telegram', 'manual'] as const
export type CardNoticeSource = (typeof CARD_NOTICE_SOURCES)[number]

export interface CardNoticeDto {
  id: string
  source: CardNoticeSource
  /** The bot it came from, as its chat is named; null for one put in by hand. */
  bot: string | null
  /** When Telegram delivered it, or when it was put in. */
  receivedAt: string
  kind: CardNoticeKind
  direction: 'in' | 'out' | null
  /** Minor units. */
  amount: number | null
  currency: AnyCurrency | null
  heading: string | null
  place: string | null
  /** The card's last four digits as the bank shows them. */
  cardTail: string | null
  /** When, by the bank's clock, as written: "2026-09-15T17:46". */
  at: string | null
  /** What was left on the card after it. */
  balance: number | null
  /** The card it is of, where the system keeps one ending so; null for a card it does not know. */
  accountId: string | null
  accountName: string | null
  /** What was left does not follow on from the notice before it on this card: one is missing between them. */
  gap: boolean
  /** The message as it was written. */
  text: string
  addedByName: string | null
  /** Money moving; null for a balance asked for and for a message not understood. */
  standing: CardNoticeStanding | null
  linkWay: CardLinkWay | null
  /** The document it is tied to. */
  document: CardDocumentRef | null
  /** Why it is left off the books. */
  reason: string | null
  /** Who tied it or left it off, and when; nobody for one the system tied. */
  handledByName: string | null
  handledAt: string | null
}

export const CARD_NOTICE_STATES = ['all', 'open', 'linked', 'dismissed', 'unread', 'gap', 'unknown_card'] as const
export type CardNoticeState = (typeof CARD_NOTICE_STATES)[number]

export const cardNoticeListQuerySchema = listQuerySchema.extend({
  accountId: idSchema.optional(),
  direction: z.enum(['all', 'in', 'out']).default('all'),
  state: z.enum(CARD_NOTICE_STATES).default('all'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type CardNoticeListQuery = z.infer<typeof cardNoticeListQuerySchema>

/** What wants looking at, whatever the list is filtered by. */
export interface CardNoticeSummary {
  /** Money the bank wrote of, since control began, that nobody has said what it was. */
  open: number
  unread: number
  gaps: number
  /** Cards the bank wrote about that the system keeps no account for, by their last digits. */
  unknownCards: string[]
}

/**
 * A notice the money in a payment window may be picked from: how much, and when — nothing of what is left on the
 * card, which a cashier is not told.
 */
export interface CardPickDto {
  id: string
  accountId: string
  direction: 'in' | 'out'
  amount: number
  currency: AnyCurrency
  /** By the bank's clock: "2026-09-15T17:46". */
  at: string | null
  receivedAt: string
  heading: string | null
  place: string | null
}

export const cardPickQuerySchema = z.object({ direction: z.enum(['in', 'out']) })

/** Money the books say moved through a card that no bank notice stands for yet, wholly or in part. */
export interface CardEntryDto {
  accountId: string
  accountName: string
  document: CardDocumentRef
  writtenAt: string
  writtenByName: string | null
  /** What moved on the card: positive when it came, negative when it left. */
  amount: number
  /** What no notice stands for, with the same sign. */
  left: number
  currency: AnyCurrency
}

export const cardEntryListQuerySchema = z.object({ accountId: idSchema.optional() })

/**
 * A card under control set beside its bank: what the bank last said was on it, what the books had at that same
 * minute, and what stands between them — the notices nobody has said anything of, and money written in the
 * books that the bank never wrote of.
 */
export interface CardStandDto {
  accountId: string
  name: string
  currency: AnyCurrency
  /** What the bank last said was left, and when. */
  bank: { balance: number; at: string } | null
  /** What the books hold now. */
  books: number
  /** What the books held at the bank's minute. */
  booksAtBank: number | null
  /** The bank's less the books': more on the card than the books know, when positive. */
  difference: number | null
  open: { in: number; inSum: number; out: number; outSum: number }
  /** Money written in the books that no notice stands for. */
  unconfirmed: number
}

export const cardNoticeDismissSchema = z.object({ reason: requiredText(200) })
export type CardNoticeDismissInput = z.infer<typeof cardNoticeDismissSchema>

export const cardNoticeMatchSchema = z.object({
  documentType: z.enum(CARD_DOCUMENT_TYPES),
  documentId: idSchema,
})
export type CardNoticeMatchInput = z.infer<typeof cardNoticeMatchSchema>

/** Money in the books the bank never wrote of, looked at and found right: the bank's own app shows it. */
export const cardEntryCheckSchema = z.object({
  documentType: z.enum(CARD_DOCUMENT_TYPES),
  documentId: idSchema,
  accountId: idSchema,
  note: optionalText(200),
})
export type CardEntryCheckInput = z.infer<typeof cardEntryCheckSchema>

/** A notice put in by hand: the message as the bot wrote it, pasted whole. */
export const cardNoticePasteSchema = z.object({
  text: z.string().trim().min(1, 'Xabar matnini kiriting').max(4000),
})
export type CardNoticePasteInput = z.infer<typeof cardNoticePasteSchema>

// ───────────────────────────── Telegram accounts ─────────────────────────────

/**
 * The banks' bots the system reads, by what their chat is called: a bank writes to a card's owner from its own
 * bot, and no bot may read another's messages — so the owner's account reads those chats, and those alone.
 */
export const BANK_BOTS: { key: string; title: string; match: RegExp }[] = [
  { key: 'humo', title: 'HUMO', match: /humo/i },
  { key: 'cardxabar', title: 'CardXabar', match: /card\s*xabar|uzcard/i },
]

/** Which bank's bot a chat is, by its name or its username; null for any other chat. */
export function bankBotOf(chat: { title: string | null; username: string | null }): string | null {
  const names = [chat.title ?? '', chat.username ?? '']
  return BANK_BOTS.find((bot) => names.some((name) => bot.match.test(name)))?.key ?? null
}

/**
 * `connected` — being read; `offline` — the connection is down and is being raised again; `signed_out` —
 * Telegram ended the session, and the account's owner signs in again; `off` — switched off here.
 */
export const TELEGRAM_ACCOUNT_STATUSES = ['connected', 'offline', 'signed_out', 'off'] as const
export type TelegramAccountStatus = (typeof TELEGRAM_ACCOUNT_STATUSES)[number]

export interface TelegramAccountDto {
  id: string
  phone: string
  name: string | null
  status: TelegramAccountStatus
  /** The banks' chats it reads. None: the account has never written to a bank's bot. */
  chats: { id: string; title: string }[]
  lastNoticeAt: string | null
  /** When the connection was last seen alive. */
  lastSeenAt: string | null
  /** What went wrong last, in words. */
  error: string | null
  createdAt: string
}

/** Whether the server has the keys of a Telegram app at all: without them no account can be signed into. */
export interface TelegramSetupDto {
  configured: boolean
  accounts: TelegramAccountDto[]
}

export const telegramLoginStartSchema = z.object({
  phone: z
    .string()
    .transform((value) => value.replace(/[\s()-]/g, ''))
    .pipe(z.string().regex(/^\+\d{8,15}$/, 'Telefon raqamini +998… ko‘rinishida to‘liq kiriting')),
  /** The connection made ready while the number was being typed (`TelegramLoginReady`); without it one is made now. */
  loginId: idSchema.optional(),
})
export type TelegramLoginStartInput = z.infer<typeof telegramLoginStartSchema>

export const telegramLoginCodeSchema = z.object({
  loginId: idSchema,
  code: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{4,8}$/, 'Telegram yuborgan kodni kiriting')),
})
export type TelegramLoginCodeInput = z.infer<typeof telegramLoginCodeSchema>

export const telegramLoginPasswordSchema = z.object({
  loginId: idSchema,
  password: z.string().min(1, 'Parolni kiriting').max(256),
})
export type TelegramLoginPasswordInput = z.infer<typeof telegramLoginPasswordSchema>

/**
 * Where a sign-in stands: the code Telegram sent is wanted, then — where the account has one — its two-step
 * password, and then it is done. Neither is kept: only the session they open.
 */
export interface TelegramLoginStep {
  loginId: string
  /** `qr`: a code is on the screen for the account's own Telegram app to scan; nothing is typed. */
  step: 'qr' | 'code' | 'password' | 'done'
  account: TelegramAccountDto | null
  /** With `qr`: what the app is to scan (a `tg://login` link), and until when Telegram keeps it. */
  qr?: { link: string; expiresAt: string }
  /** With the code asked for: where Telegram said it sent it — the window says so, not "wait for an SMS". */
  sentBy?: TelegramCodeWay
  /** The way Telegram offers to send it again where the first never came; null: it offers none. */
  nextBy?: TelegramCodeWay | null
}

/** "The code never came": Telegram is asked to send it again, the next way it offers. */
export const telegramLoginResendSchema = z.object({ loginId: idSchema })
export type TelegramLoginResendInput = z.infer<typeof telegramLoginResendSchema>

/**
 * Signing in with no number and no code: the account's own Telegram app scans a QR code (Settings → Devices →
 * Link Desktop Device). The window asks again every couple of seconds — the answer is the code still to show
 * (a fresh one where the last ran out), the two-step password to ask for, or the account, signed in.
 */
export const telegramLoginQrSchema = z.object({ loginId: idSchema.optional() })
export type TelegramLoginQrInput = z.infer<typeof telegramLoginQrSchema>

/**
 * A connection to Telegram made ready as the sign-in window opens: raising one takes a second or two, and that
 * is spent while the number is being typed instead of after "send the code" is pressed.
 */
export interface TelegramLoginReady {
  loginId: string
}

/**
 * How Telegram delivers a sign-in code. It decides itself: into the account's own Telegram app where the account
 * is signed in somewhere (`app`, by far the usual), else by SMS, a call, or the e-mail the account keeps.
 */
export const TELEGRAM_CODE_WAYS = ['app', 'sms', 'call', 'email', 'other'] as const
export type TelegramCodeWay = (typeof TELEGRAM_CODE_WAYS)[number]
