import { SYSTEM_ACCOUNT_LABELS, type AnyCurrency, type SystemAccount } from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { Account, LedgerEntry, Organization, type Customer, type Register } from '../../database/entities'
import { RELEASE_NOTICES } from '../cards/card-links'
import { drawerName } from './drawers'

/** One side of a movement: so much into an account (or, negative, out of it), and its worth in the base. */
export interface Posting {
  accountId: string
  /** In the account's own currency. */
  amount: number
  /** In the business's base. */
  base: number
}

/** What a customer merged into another had, carried to that other's account — then, and whenever more reaches it. */
export const CUSTOMER_MERGE = 'customer_merge'

export interface EntryHead {
  date: string
  kind: string
  documentType?: string
  documentId?: string
  shiftId?: string | null
  note?: string | null
}

/**
 * The money ledger. `post` is the only way an account's balance changes: it
 * writes the lines of one movement and moves the balances by the same
 * amounts in the caller's transaction. The lines of an entry, valued in
 * the base, add up to nothing; one that would not is a bug and is refused here
 * before the database refuses it at commit.
 */
@Injectable()
export class LedgerService {
  async post(
    em: EntityManager,
    actor: { orgId: string; userId: string | null },
    head: EntryHead,
    postings: Posting[],
  ): Promise<string | null> {
    const lines = postings.filter((line) => line.amount !== 0 || line.base !== 0)
    if (!lines.length) {
      return null
    }
    const sum = lines.reduce((total, line) => total + line.base, 0)
    if (sum !== 0) {
      throw new Error(`Ledger entry "${head.kind}" does not balance: off by ${sum}`)
    }

    const entry = await em.save(
      em.create(LedgerEntry, {
        orgId: actor.orgId,
        entryDate: head.date,
        kind: head.kind,
        documentType: head.documentType ?? null,
        documentId: head.documentId ?? null,
        shiftId: head.shiftId ?? null,
        note: head.note ?? null,
        createdBy: actor.userId,
      }),
    )
    await em.query(
      `INSERT INTO ledger_lines (org_id, entry_id, position, account_id, amount, base)
       SELECT $1, $2, d.position, d.account_id, d.amount, d.base
       FROM unnest($3::uuid[], $4::bigint[], $5::bigint[]) WITH ORDINALITY AS d (account_id, amount, base, position)`,
      [
        actor.orgId,
        entry.id,
        lines.map((line) => line.accountId),
        lines.map((line) => line.amount),
        lines.map((line) => line.base),
      ],
    )
    // An account may be on several lines of one entry; it is moved once, by their sum.
    await em.query(
      `UPDATE accounts a SET balance = a.balance + d.amount
       FROM (
         SELECT account_id, sum(amount) AS amount
         FROM unnest($1::uuid[], $2::bigint[]) AS x (account_id, amount) GROUP BY account_id
       ) d
       WHERE a.id = d.account_id`,
      [lines.map((line) => line.accountId), lines.map((line) => line.amount)],
    )
    if (head.kind !== CUSTOMER_MERGE) {
      await this.carryOn(em, actor, head, lines)
    }
    // A document whose money is gone from a card again gives back the bank's notices that stood for it.
    if (head.documentType && head.documentId) {
      await em.query(RELEASE_NOTICES, [head.documentType, head.documentId])
    }
    return entry.id
  }

  /**
   * A customer merged into another keeps no balance. What still reaches one of their accounts — goods brought back
   * on an old receipt, an old payment undone — is carried, by an entry of its own, to the account of who they are
   * now, in the same currency and for the same worth.
   */
  private async carryOn(
    em: EntityManager,
    actor: { orgId: string; userId: string | null },
    head: EntryHead,
    lines: Posting[],
  ): Promise<void> {
    const merged: { id: string; currency: AnyCurrency; was: string; now: string; org_id: string; name: string }[] =
      await em.query(
        `SELECT a.id, a.currency, c.id AS was, s.id AS now, s.org_id, s.name
         FROM accounts a JOIN customers c ON c.id = a.customer_id JOIN customers s ON s.id = c.merged_into
         WHERE a.id = ANY($1)`,
        [[...new Set(lines.map((line) => line.accountId))]],
      )
    for (const account of merged) {
      const reached = lines.filter((line) => line.accountId === account.id)
      const amount = reached.reduce((sum, line) => sum + line.amount, 0)
      const base = reached.reduce((sum, line) => sum + line.base, 0)
      const theirs = await this.customerAccount(
        em,
        { id: account.now, orgId: account.org_id, name: account.name },
        account.currency,
      )
      await this.post(
        em,
        actor,
        { date: head.date, kind: CUSTOMER_MERGE, documentType: CUSTOMER_MERGE, documentId: account.was },
        [
          { accountId: account.id, amount: -amount, base: -base },
          { accountId: theirs.id, amount, base },
        ],
      )
    }
  }

  /** Undoes what a document posted, line for line with the sign turned: the original stays in the books. */
  async reverse(
    em: EntityManager,
    actor: { orgId: string; userId: string | null },
    head: EntryHead & { documentType: string; documentId: string },
    reversedKind: string,
  ): Promise<void> {
    const lines: { account_id: string; amount: number; base: number }[] = await em.query(
      `SELECT l.account_id, l.amount::float8 AS amount, l.base::float8 AS base
       FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE e.document_type = $1 AND e.document_id = $2 AND e.kind = $3
       ORDER BY l.position`,
      [head.documentType, head.documentId, reversedKind],
    )
    await this.post(
      em,
      actor,
      head,
      lines.map((line) => ({ accountId: line.account_id, amount: -line.amount, base: -line.base })),
    )
  }

  /** One of the business's own accounts, kept in its base; made the first time it is needed. */
  async systemAccount(em: EntityManager, orgId: string, key: SystemAccount): Promise<Account> {
    const existing = await em.findOneBy(Account, { systemKey: key })
    if (existing) {
      return existing
    }
    const { baseCurrency } = await em.findOneByOrFail(Organization, { id: orgId })
    return em.save(
      em.create(Account, {
        orgId,
        kind: 'system',
        systemKey: key,
        name: SYSTEM_ACCOUNT_LABELS[key],
        currency: baseCurrency,
        balance: 0,
        isActive: true,
      }),
    )
  }

  /**
   * A customer's account in one currency: what they owe in it, negative when the business owes them. Made the
   * first time something is owed either way in that currency; a customer has as many as the currencies they
   * deal in, and they are never added together.
   */
  async customerAccount(
    em: EntityManager,
    customer: Pick<Customer, 'id' | 'orgId' | 'name'>,
    currency: AnyCurrency,
  ): Promise<Account> {
    const existing = await em.findOneBy(Account, { customerId: customer.id, currency })
    if (existing) {
      return existing
    }
    return em.save(
      em.create(Account, {
        orgId: customer.orgId,
        kind: 'customer',
        name: customer.name,
        currency,
        customerId: customer.id,
        balance: 0,
        isActive: true,
      }),
    )
  }

  /** A till's drawer in one currency; made the first time money of that currency goes in. */
  async cashAccount(em: EntityManager, register: Register, currency: AnyCurrency): Promise<Account> {
    const existing = await em.findOneBy(Account, { registerId: register.id, currency })
    if (existing) {
      return existing
    }
    return em.save(
      em.create(Account, {
        orgId: register.orgId,
        kind: 'cash',
        name: drawerName(register.name, currency),
        currency,
        locationId: register.locationId,
        locationIds: [register.locationId],
        registerId: register.id,
        balance: 0,
        isActive: true,
      }),
    )
  }

  /** Whether anything was ever posted to an account. */
  async isUsed(em: EntityManager, accountId: string): Promise<boolean> {
    const [row] = await em.query(`SELECT 1 FROM ledger_lines WHERE account_id = $1 LIMIT 1`, [accountId])
    return !!row
  }

  /** The business's day: its own time zone decides when one ends, not the server's. */
  async today(em: EntityManager, orgId: string): Promise<string> {
    const [{ day }]: { day: string }[] = await em.query(
      `SELECT (now() AT TIME ZONE timezone)::date::text AS day FROM organizations WHERE id = $1`,
      [orgId],
    )
    return day
  }
}
