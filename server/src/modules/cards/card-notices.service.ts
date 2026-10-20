import { createHash } from 'node:crypto'

import {
  followsOn,
  formatMoney,
  parseBankNotice,
  type AnyCurrency,
  type CardDocumentRef,
  type CardEntryCheckInput,
  type CardEntryDto,
  type CardInEvent,
  type CardLinkWay,
  type CardNoticeDto,
  type CardNoticeKind,
  type CardNoticeListQuery,
  type CardNoticeMatchInput,
  type CardNoticePasteInput,
  type CardNoticeSource,
  type CardNoticeStanding,
  type CardNoticeSummary,
  type CardPickDto,
  type CardStandDto,
  type Page,
} from '@erp/core'
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Account, CardCheck } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { mayUse } from '../money/places'
import { RealtimeService } from '../realtime/realtime.service'
import {
  autoTie,
  candidatesFor,
  documentsOf,
  matchNotice,
  SINCE,
  unconfirmed,
  unconfirmedCount,
  untied,
} from './card-links'

export interface IncomingNotice {
  source: CardNoticeSource
  /** Where it came from, once: a message is kept one time however often it is read. */
  sourceKey: string
  telegramAccountId: string | null
  bot: string | null
  /** When Telegram delivered it; null for one put in by hand, which goes by the bank's own clock. */
  receivedAt: Date | null
  text: string
  addedBy?: Pick<Actor, 'userId' | 'name'>
}

interface NoticeRow {
  id: string
  source: CardNoticeSource
  bot: string | null
  received_at: Date
  kind: CardNoticeKind
  direction: 'in' | 'out' | null
  amount: number | null
  currency: AnyCurrency | null
  heading: string | null
  place: string | null
  card_tail: string | null
  stated_at: string | null
  balance: number | null
  account_id: string | null
  account_name: string | null
  gap: boolean
  text: string
  added_by_name: string | null
  standing: CardNoticeStanding | null
  link_way: CardLinkWay | null
  document_type: string | null
  document_id: string | null
  reason: string | null
  handled_by_name: string | null
  handled_at: Date | null
}

const COLUMNS = `n.id, n.source, n.bot, n.received_at, n.kind, n.direction, n.amount::float8 AS amount, n.currency,
  n.heading, n.place, n.card_tail, n.stated_at, n.balance::float8 AS balance, n.account_id, a.name AS account_name,
  n.gap, n.text, n.added_by_name, n.standing, n.link_way, n.document_type, n.document_id, n.reason,
  n.handled_by_name, n.handled_at`

/** Who may pick a card's money from its notices: whoever writes money that goes through a card. */
const PICKERS = ['pos.sell', 'customers.receive', 'customers.pay_out', 'money.ops', 'money.manage', 'cards.settle']

/** How far back a payment window offers notices to pick from. */
const PICK_DAYS = 3

/** How lately money must have landed to be said to the screens: a chat's past, read at sign-in, is not news. */
const FRESH_MS = 10 * 60_000

/** What the cards the banks' bots write of are kept in. */
const CARD_CURRENCY = 'UZS'

/**
 * Whether a notice (`n`) is HUMO's: it came from that bot's chat, or — put in by hand — names the card as that
 * bot does. Two cards of two banks may end in the same four digits; this tells their notices apart.
 */
const OF_HUMO = `(coalesce(n.bot, '') ILIKE '%humo%' OR n.text ILIKE '%humocard%')`

/** How many of a card's latest notices are looked over when one more comes: enough for a late one to find its place. */
const CHAIN = 60

/**
 * What the banks' bots wrote about the business's cards (KEYINGI-REJA, 18-bo'lim): kept as it came, read as far
 * as it can be read, and set in order on its card — so that a notice that never arrived shows as a break in what
 * was left. Nothing here moves money in the books.
 */
@Injectable()
export class CardNoticesService implements OnModuleDestroy {
  private readonly logger = new Logger(CardNoticesService.name)
  /** Businesses whose money moved a moment ago: their open notices are tried against it once it settles. */
  private readonly waiting = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {
    this.realtime.onChanged((orgId, resources) => {
      if (resources.includes('money')) {
        this.soon(orgId)
      }
    })
  }

  onModuleDestroy() {
    for (const timer of this.waiting.values()) {
      clearTimeout(timer)
    }
    this.waiting.clear()
  }

  async list(actor: Actor, query: CardNoticeListQuery): Promise<Page<CardNoticeDto> & { summary: CardNoticeSummary }> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      await this.knowCards(em)
      const where: string[] = []
      const params: unknown[] = []
      const said = (value: unknown) => `$${params.push(value)}`
      if (query.accountId) where.push(`n.account_id = ${said(query.accountId)}`)
      if (query.direction !== 'all') where.push(`n.direction = ${said(query.direction)}`)
      if (query.state === 'open') where.push(`n.standing = 'open' AND n.received_at >= ${SINCE}`)
      if (query.state === 'linked') where.push(`n.standing = 'linked'`)
      if (query.state === 'dismissed') where.push(`n.standing = 'dismissed'`)
      if (query.state === 'unread') where.push(`n.kind = 'unread'`)
      if (query.state === 'gap') where.push(`n.gap`)
      if (query.state === 'unknown_card') where.push(`n.card_tail IS NOT NULL AND n.account_id IS NULL`)
      // The day is the bank's own where it wrote one, and the business's day of arrival where it did not.
      const day = `coalesce(left(n.stated_at, 10), to_char(n.received_at AT TIME ZONE o.timezone, 'YYYY-MM-DD'))`
      if (query.from) where.push(`${day} >= ${said(query.from)}`)
      if (query.to) where.push(`${day} <= ${said(query.to)}`)
      if (query.q?.trim()) where.push(`n.text ILIKE ${said(`%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`)}`)
      const from = `FROM card_notices n
        JOIN organizations o ON o.id = n.org_id
        LEFT JOIN accounts a ON a.id = n.account_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`

      const [{ total }]: { total: number }[] = await em.query(`SELECT count(*)::int AS total ${from}`, params)
      const rows: NoticeRow[] = await em.query(
        `SELECT ${COLUMNS}
         ${from}
         ORDER BY n.received_at DESC, n.created_at DESC, n.id DESC
         LIMIT ${said(query.size)} OFFSET ${said((query.page - 1) * query.size)}`,
        params,
      )
      const [summary]: { open: number; unread: number; gaps: number; unknown: string[] }[] = await em.query(
        `SELECT count(*) FILTER (WHERE standing = 'open' AND received_at >= ${SINCE})::int AS open,
                count(*) FILTER (WHERE kind = 'unread')::int AS unread,
                count(*) FILTER (WHERE gap)::int AS gaps,
                coalesce(array_agg(DISTINCT card_tail ORDER BY card_tail)
                  FILTER (WHERE card_tail IS NOT NULL AND account_id IS NULL), '{}') AS unknown
         FROM card_notices`,
      )
      return {
        items: await this.dtos(em, rows),
        total,
        page: query.page,
        size: query.size,
        summary: { open: summary.open, unread: summary.unread, gaps: summary.gaps, unknownCards: summary.unknown },
      }
    })
  }

  /** A notice put in by hand: the bot's message pasted whole, by someone who may. The same message is not kept twice. */
  async paste(actor: Actor, input: CardNoticePasteInput): Promise<CardNoticeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const key = `manual:${createHash('sha256').update(input.text.replace(/\s+/g, ' ')).digest('hex')}`
      const id = await this.takeIn(em, actor.orgId, {
        source: 'manual',
        sourceKey: key,
        telegramAccountId: null,
        bot: null,
        receivedAt: null,
        text: input.text,
        addedBy: actor,
      })
      if (!id) {
        throw AppError.validation({ text: 'Bu xabar avval kiritilgan' })
      }
      const notice = await this.one(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'card_notice.paste',
        entity: 'card_notice',
        entityId: id,
        summary: notice.kind === 'unread' ? 'o‘qilmadi' : `${notice.cardTail ? `*${notice.cardTail}` : 'karta'}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['card-notices']))
      return notice
    })
  }

  /**
   * What a Telegram account's reader hands over. False for a message already kept. Money that has just landed
   * on a card is said to the screens at once; what is read out of a chat's past is not — it is old news.
   */
  async take(orgId: string, incoming: IncomingNotice): Promise<boolean> {
    return this.db.tenant(orgId, async ({ em, afterCommit }) => {
      const id = await this.takeIn(em, orgId, incoming)
      if (!id) {
        return false
      }
      afterCommit(() => this.realtime.changed(orgId, ['card-notices']))
      // Money already written in the books — a card payment the till took a minute ago — is tied to it at once.
      await autoTie(em, id)
      const notice = await this.one(em, id)
      const fresh = Date.now() - new Date(notice.receivedAt).getTime() < FRESH_MS
      if (notice.kind === 'move' && notice.direction === 'in' && notice.amount && notice.currency && fresh) {
        const [card]: { location_ids: string[] }[] = notice.accountId
          ? await em.query(`SELECT location_ids FROM accounts WHERE id = $1`, [notice.accountId])
          : []
        const came: CardInEvent = {
          id,
          accountId: notice.accountId,
          card: notice.accountName ?? `*${notice.cardTail ?? ''}`,
          amount: notice.amount,
          currency: notice.currency,
          at: notice.at,
          locationIds: card?.location_ids ?? [],
        }
        afterCommit(() => this.realtime.event(orgId, 'card.in', came))
      }
      return true
    })
  }

  /** Keeps one message, read as far as it can be. Returns its id, or null where it is kept already. */
  async takeIn(em: EntityManager, orgId: string, incoming: IncomingNotice): Promise<string | null> {
    const parsed = parseBankNotice(incoming.text)
    const move = parsed?.kind === 'move' ? parsed : null
    const tail = parsed?.cardTail ?? null
    const [kept]: { id: string; humo: boolean }[] = await em.query(
      `INSERT INTO card_notices
         (org_id, source, source_key, telegram_account_id, bot, received_at, text, kind, direction, amount, currency,
          heading, place, card_tail, stated_at, balance, added_by, added_by_name, standing)
       SELECT $1, $2, $3, $4, $5,
              -- One put in by hand takes its place by the bank's own clock, read as the business's.
              coalesce($6::timestamptz, $14::text::timestamp AT TIME ZONE o.timezone, now()),
              $7, $8, $9, $10, $11, $12, $13, $15, $14::text, $16, $17, $18,
              CASE WHEN $8 = 'move' THEN 'open' END
       FROM organizations o WHERE o.id = $1
       ON CONFLICT ON CONSTRAINT card_notices_source DO NOTHING
       RETURNING id, ${OF_HUMO.replace(/n\./g, '')} AS humo`,
      [
        orgId,
        incoming.source,
        incoming.sourceKey,
        incoming.telegramAccountId,
        incoming.bot,
        incoming.receivedAt,
        incoming.text,
        parsed?.kind ?? 'unread',
        move?.direction ?? null,
        move?.amount ?? null,
        parsed?.currency ?? null,
        move?.heading ?? null,
        move?.place ?? null,
        move?.at ?? null,
        tail,
        parsed?.balance ?? null,
        incoming.addedBy?.userId ?? null,
        incoming.addedBy?.name ?? null,
      ],
    )
    if (!kept) {
      return null
    }
    await this.knowCards(em)
    if (tail) {
      await this.chain(em, tail, kept.humo)
    }
    return kept.id
  }

  // ───────────────────────────── Set beside the books ─────────────────────────────

  /**
   * The notices a payment window offers beside a card's line: open, of the cards this person may use, from the
   * last few days. How much and when, nothing of what is left on the card.
   */
  async picks(actor: Actor, direction: 'in' | 'out'): Promise<CardPickDto[]> {
    if (!PICKERS.some((permission) => can(actor, permission))) {
      throw AppError.forbidden()
    }
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rows: {
        id: string
        account_id: string
        location_ids: string[]
        amount: number
        currency: AnyCurrency
        stated_at: string | null
        received_at: Date
        heading: string | null
        place: string | null
      }[] = await em.query(
        `SELECT n.id, n.account_id, a.location_ids, n.amount::float8 AS amount, n.currency, n.stated_at,
                n.received_at, n.heading, n.place
         FROM card_notices n JOIN accounts a ON a.id = n.account_id
         WHERE n.standing = 'open' AND n.direction = $1 AND n.received_at > now() - make_interval(days => $2)
         ORDER BY n.received_at DESC LIMIT 200`,
        [direction, PICK_DAYS],
      )
      return rows
        .filter((row) => mayUse(actor, { locationIds: row.location_ids }))
        .map((row) => ({
          id: row.id,
          accountId: row.account_id,
          direction,
          amount: row.amount,
          currency: row.currency,
          at: row.stated_at,
          receivedAt: row.received_at.toISOString(),
          heading: row.heading,
          place: row.place,
        }))
    })
  }

  /** The documents an open notice may be of, the likeliest first. */
  async candidates(actor: Actor, id: string): Promise<CardEntryDto[]> {
    return this.db.tenant(actor.orgId, ({ em }) => candidatesFor(em, id))
  }

  /** Money in the books no notice stands for yet: the bank never wrote of it, or its notice is still open. */
  async entries(actor: Actor, accountId?: string): Promise<CardEntryDto[]> {
    return this.db.tenant(actor.orgId, ({ em }) => unconfirmed(em, accountId))
  }

  /** The notice's money is that of a document already in the books. */
  async match(actor: Actor, id: string, input: CardNoticeMatchInput): Promise<CardNoticeDto> {
    return this.settle(actor, id, async (em) => {
      const problem = await matchNotice(em, actor, id, { type: input.documentType, id: input.documentId })
      if (problem) {
        throw AppError.conflict('CARD_NOTICE_UNFIT', problem)
      }
      return 'card_notice.match'
    })
  }

  /** Knowingly left off the books, by a named person, for the reason they give. */
  async dismiss(actor: Actor, id: string, reason: string): Promise<CardNoticeDto> {
    return this.settle(actor, id, async (em) => {
      const [held] = await this.held(em, id, 'open')
      if (!held) {
        throw AppError.conflict('CARD_NOTICE_SETTLED', 'Bank xabari ochiq emas: ro‘yxatni yangilang')
      }
      await em.query(
        `UPDATE card_notices SET standing = 'dismissed', reason = $2, handled_by = $3, handled_by_name = $4,
                handled_at = now() WHERE id = $1`,
        [id, reason, actor.userId, actor.name],
      )
      return 'card_notice.dismiss'
    })
  }

  /** Undone, whichever way it was settled: tied to a document or left off, it waits to be said of again. */
  async reopen(actor: Actor, id: string): Promise<CardNoticeDto> {
    return this.settle(actor, id, async (em) => {
      const [held] = await this.held(em, id, 'linked', 'dismissed')
      if (!held) {
        throw AppError.conflict('CARD_NOTICE_OPEN', 'Bank xabari hali hal qilinmagan')
      }
      await em.query(
        `UPDATE card_notices SET standing = 'open', link_way = NULL, document_type = NULL, document_id = NULL,
                reason = NULL, handled_by = NULL, handled_by_name = NULL, handled_at = NULL WHERE id = $1`,
        [id],
      )
      return 'card_notice.reopen'
    })
  }

  /** Money in the books the bank never wrote of, looked at and found right; or, said again, still to look at. */
  async check(actor: Actor, input: CardEntryCheckInput, checked: boolean): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const account = await em.findOneBy(Account, { id: input.accountId })
      if (!account || account.kind !== 'card') {
        throw AppError.notFound('Karta topilmadi')
      }
      const key = { documentType: input.documentType, documentId: input.documentId, accountId: account.id }
      if (checked) {
        await em.query(
          `INSERT INTO card_checks (org_id, document_type, document_id, account_id, note, created_by, created_by_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ON CONSTRAINT card_checks_one DO NOTHING`,
          [actor.orgId, key.documentType, key.documentId, key.accountId, input.note, actor.userId, actor.name],
        )
      } else {
        await em.delete(CardCheck, key)
      }
      const named = (await documentsOf(em, [{ type: key.documentType, id: key.documentId }])).get(
        `${key.documentType}:${key.documentId}`,
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: checked ? 'card_entry.check' : 'card_entry.uncheck',
        entity: 'card_check',
        entityId: input.documentId,
        summary: `${named?.number ?? key.documentType}, ${account.name}${checked && input.note ? `: ${input.note}` : ''}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['card-notices']))
    })
  }

  /** Each card under control beside its bank: what it last said was there, and what stands between. */
  async stand(actor: Actor): Promise<CardStandDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const cards: {
        id: string
        name: string
        currency: AnyCurrency
        balance: number
        bank_balance: number | null
        bank_at: Date | null
        open_in: number
        in_sum: number
        open_out: number
        out_sum: number
      }[] = await em.query(
        `SELECT a.id, a.name, a.currency, a.balance::float8 AS balance, b.balance::float8 AS bank_balance,
                b.received_at AS bank_at,
                count(o.id) FILTER (WHERE o.direction = 'in')::int AS open_in,
                coalesce(sum(o.amount) FILTER (WHERE o.direction = 'in'), 0)::float8 AS in_sum,
                count(o.id) FILTER (WHERE o.direction = 'out')::int AS open_out,
                coalesce(sum(o.amount) FILTER (WHERE o.direction = 'out'), 0)::float8 AS out_sum
         FROM accounts a
         LEFT JOIN LATERAL (
           SELECT balance, received_at FROM card_notices
           WHERE account_id = a.id AND balance IS NOT NULL
           ORDER BY received_at DESC, created_at DESC LIMIT 1
         ) b ON true
         LEFT JOIN card_notices o ON o.account_id = a.id AND o.standing = 'open' AND o.received_at >= ${SINCE}
         WHERE a.kind = 'card' AND EXISTS (SELECT 1 FROM card_notices n WHERE n.account_id = a.id)
         GROUP BY a.id, b.balance, b.received_at
         ORDER BY a.name`,
      )
      const waiting = await unconfirmedCount(em)
      const result: CardStandDto[] = []
      for (const card of cards) {
        // What the books took in after the bank's minute is taken back out: money tied to a notice counts from
        // the notice's own time, whenever it was written.
        const [later]: { total: number }[] = card.bank_at
          ? await em.query(
              `SELECT coalesce(sum(l.amount), 0)::float8 AS total
               FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
               WHERE l.account_id = $1 AND coalesce(
                 (SELECT min(n.received_at) FROM card_notices n
                  WHERE n.standing = 'linked' AND n.document_type = e.document_type
                    AND n.document_id = e.document_id AND n.account_id = l.account_id),
                 e.created_at) > $2`,
              [card.id, card.bank_at],
            )
          : [{ total: 0 }]
        const booksAtBank = card.bank_at ? card.balance - later.total : null
        result.push({
          accountId: card.id,
          name: card.name,
          currency: card.currency,
          bank:
            card.bank_balance !== null && card.bank_at
              ? { balance: card.bank_balance, at: card.bank_at.toISOString() }
              : null,
          books: card.balance,
          booksAtBank,
          difference: card.bank_balance !== null && booksAtBank !== null ? card.bank_balance - booksAtBank : null,
          open: { in: card.open_in, inSum: card.in_sum, out: card.open_out, outSum: card.out_sum },
          unconfirmed: waiting.get(card.id) ?? 0,
        })
      }
      return result
    })
  }

  /** One way of settling a notice, recorded and told: the work says which. */
  private async settle(actor: Actor, id: string, work: (em: EntityManager) => Promise<string>): Promise<CardNoticeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const action = await work(em)
      const notice = await this.one(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action,
        entity: 'card_notice',
        entityId: id,
        summary:
          `${notice.accountName ?? `*${notice.cardTail ?? ''}`}, ${notice.direction === 'out' ? '−' : '+'}` +
          `${notice.amount !== null && notice.currency ? formatMoney(notice.amount, notice.currency) : ''}` +
          (notice.document?.number ? ` → ${notice.document.number}` : '') +
          (notice.reason ? `: ${notice.reason}` : ''),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['card-notices']))
      return notice
    })
  }

  /** The notice, held, where it stands so. */
  private held(em: EntityManager, id: string, ...standings: CardNoticeStanding[]): Promise<{ id: string }[]> {
    return em.query(`SELECT id FROM card_notices WHERE id = $1 AND standing = ANY($2) FOR UPDATE`, [id, standings])
  }

  /**
   * Money moved in the books a moment ago: the business's open notices are tried against it once the moment has
   * passed, and the screens told — a document undone may have given notices back.
   */
  private soon(orgId: string): void {
    clearTimeout(this.waiting.get(orgId))
    const timer = setTimeout(() => {
      this.waiting.delete(orgId)
      this.tieWaiting(orgId).catch((error: Error) => this.logger.warn(`card notices: ${error.message}`))
    }, 1500)
    timer.unref()
    this.waiting.set(orgId, timer)
  }

  /** Tries every open notice of the last days against the books once more. */
  async tieWaiting(orgId: string): Promise<number> {
    return this.db.tenant(orgId, async ({ em, afterCommit }) => {
      const [{ any }]: { any: boolean }[] = await em.query(`SELECT EXISTS (SELECT 1 FROM card_notices) AS any`)
      if (!any) {
        return 0
      }
      let tied = 0
      for (const id of await untied(em)) {
        if (await autoTie(em, id)) {
          tied += 1
        }
      }
      afterCommit(() => this.realtime.changed(orgId, ['card-notices']))
      return tied
    })
  }

  // ───────────────────────────── Inside ─────────────────────────────

  /**
   * Says which card each notice is of: the business's so'm card of that bank's kind ending in the same four
   * digits, where there is exactly one. The banks' bots write of so'm cards alone, and each of its own kind
   * (owner, 2026-10-12): HUMO's of Humo cards — theirs begin 9860 — and CardXabar's of the others. A card kept
   * in another currency, or of the other kind, that happens to end the same is not the one meant. A card added
   * after its notices came finds them here.
   */
  private async knowCards(em: EntityManager): Promise<void> {
    await em.query(
      `UPDATE card_notices n SET account_id = c.id
       FROM (
         SELECT last4, (card_number LIKE '9860%') AS humo, min(id::text)::uuid AS id FROM accounts
         WHERE kind = 'card' AND currency = $1 AND last4 IS NOT NULL
         GROUP BY last4, (card_number LIKE '9860%') HAVING count(*) = 1
       ) c
       WHERE n.card_tail = c.last4 AND coalesce(n.currency, $1) = $1 AND c.humo = ${OF_HUMO}
         AND n.account_id IS DISTINCT FROM c.id AND n.standing IS DISTINCT FROM 'linked'`,
      [CARD_CURRENCY],
    )
  }

  /**
   * Sets a card's latest notices in order and marks each that does not follow on from the one before it: what
   * was left then, with this one's sum added or taken, is not what is left now — a notice between them never
   * came. A card's notices are its bank's alone: HUMO's and CardXabar's never make one chain. A balance the owner asked for is a notice with no sum: it must say what the one before it said.
   */
  private async chain(em: EntityManager, tail: string, humo: boolean): Promise<void> {
    const rows: {
      id: string
      kind: 'move' | 'balance'
      direction: 'in' | 'out' | null
      amount: number | null
      currency: string | null
      balance: number | null
      gap: boolean
    }[] = await em.query(
      `SELECT n.id, n.kind, n.direction, n.amount::float8 AS amount, n.currency, n.balance::float8 AS balance, n.gap
       FROM card_notices n
       WHERE n.card_tail = $1 AND n.kind IN ('move', 'balance') AND ${OF_HUMO} = $3
       ORDER BY n.received_at DESC, n.created_at DESC, n.id DESC LIMIT $2`,
      [tail, CHAIN, humo],
    )
    const before = new Map<string, number>()
    const marked: string[] = []
    const cleared: string[] = []
    rows.reverse().forEach((row, index) => {
      const earlier = row.currency ? before.get(row.currency) : undefined
      if (row.balance !== null && row.currency) {
        before.set(row.currency, row.balance)
      }
      // The oldest in the window has nothing before it to be held against: it keeps what it was marked.
      if (index === 0 || earlier === undefined || row.balance === null) {
        return
      }
      const follows =
        row.kind === 'balance'
          ? earlier === row.balance
          : followsOn(
              { balance: earlier },
              { direction: row.direction ?? 'in', amount: row.amount ?? 0, balance: row.balance },
            )
      const gap = follows === false
      if (gap !== row.gap) {
        ;(gap ? marked : cleared).push(row.id)
      }
    })
    if (marked.length) {
      await em.query(`UPDATE card_notices SET gap = true WHERE id = ANY($1)`, [marked])
    }
    if (cleared.length) {
      await em.query(`UPDATE card_notices SET gap = false WHERE id = ANY($1)`, [cleared])
    }
  }

  private async one(em: EntityManager, id: string): Promise<CardNoticeDto> {
    const [row]: NoticeRow[] = await em.query(
      `SELECT ${COLUMNS} FROM card_notices n LEFT JOIN accounts a ON a.id = n.account_id WHERE n.id = $1`,
      [id],
    )
    if (!row) {
      throw AppError.notFound('Bank xabari topilmadi')
    }
    return (await this.dtos(em, [row]))[0]
  }

  /** The notices as the screens read them, each tied one naming its document. */
  private async dtos(em: EntityManager, rows: NoticeRow[]): Promise<CardNoticeDto[]> {
    const documents = await documentsOf(
      em,
      rows.flatMap((row) =>
        row.document_type && row.document_id ? [{ type: row.document_type, id: row.document_id }] : [],
      ),
    )
    return rows.map((row) =>
      toDto(row, row.document_id ? (documents.get(`${row.document_type}:${row.document_id}`) ?? null) : null),
    )
  }
}

function toDto(row: NoticeRow, document: CardDocumentRef | null): CardNoticeDto {
  return {
    id: row.id,
    source: row.source,
    bot: row.bot,
    receivedAt: row.received_at.toISOString(),
    kind: row.kind,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    heading: row.heading,
    place: row.place,
    cardTail: row.card_tail,
    at: row.stated_at,
    balance: row.balance,
    accountId: row.account_id,
    accountName: row.account_name,
    gap: row.gap,
    text: row.text,
    addedByName: row.added_by_name,
    standing: row.standing,
    linkWay: row.link_way,
    document,
    reason: row.reason,
    handledByName: row.handled_by_name,
    handledAt: row.handled_at?.toISOString() ?? null,
  }
}
