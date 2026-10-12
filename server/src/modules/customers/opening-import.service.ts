import {
  type AnyCurrency,
  type OpeningImportInput,
  type OpeningImportResult,
  type OpeningImportRowResult,
  type OpeningRow,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { Db } from '../../database/db.service'
import { Account, Customer } from '../../database/entities'
import { can, type Actor } from '../auth/actor'
import { wantingRate } from '../money/agreed'
import { CurrenciesService } from '../money/currencies.service'
import { RealtimeService } from '../realtime/realtime.service'
import { CustomersService } from './customers.service'
import { CustomerPaymentsService } from './payments.service'
import { businessDay } from './standing'

class Undo extends Error {
  constructor(readonly result: OpeningImportResult) {
    super('undo')
  }
}

/** A key of its own for each row of a file, made from the file's: sent twice, a row is written once. */
const rowKey = (clientKey: string, row: number) => `${clientKey.slice(0, 24)}${row.toString(16).padStart(12, '0')}`

/**
 * What stood between the business and its customers before the books began,
 * from a spreadsheet: each row finds its customer by phone, or by name, and
 * whoever is not in the book is written down. A trial run does what the real
 * one does and then undoes it; one row that cannot be taken stops the whole
 * file — half the balances in the books is worse than none.
 */
@Injectable()
export class OpeningImportService {
  constructor(
    private readonly db: Db,
    private readonly customers: CustomersService,
    private readonly payments: CustomerPaymentsService,
    private readonly currencies: CurrenciesService,
    private readonly realtime: RealtimeService,
  ) {}

  async run(actor: Actor, input: OpeningImportInput): Promise<OpeningImportResult> {
    try {
      return await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
        const result = await this.import(em, actor, input)
        if (input.dryRun || result.rows.some((row) => row.problem)) {
          throw new Undo(result)
        }
        afterCommit(() => this.realtime.changed(actor.orgId, ['customers', 'customer-payments']))
        return { ...result, done: true }
      })
    } catch (error) {
      if (error instanceof Undo) {
        return error.result
      }
      throw error
    }
  }

  private async import(em: EntityManager, actor: Actor, input: OpeningImportInput): Promise<OpeningImportResult> {
    const book = await this.currencies.book(em, actor, await businessDay(em, actor.orgId))
    const kept = await this.currencies.kept(em, actor)
    const rows: OpeningImportRowResult[] = []
    const totals = new Map<AnyCurrency, { owes: number; owed: number }>()
    const seen = new Set<number>()
    let created = 0

    for (const row of input.rows) {
      const change = row.owes === 'customer' ? row.amount : -row.amount
      const said = { row: row.row, customerName: row.name, created: false, currency: row.currency, change }
      const refuse = (problem: string) => rows.push({ ...said, balance: null, again: false, problem })
      if (seen.has(row.row)) {
        refuse('Qator ikki marta yuborilgan')
        continue
      }
      seen.add(row.row)

      const who = await this.who(em, actor, row, kept)
      if (typeof who === 'string') {
        refuse(who)
        continue
      }
      const { customer } = who
      const currency = row.currency ?? customer.currency
      const wanting = kept.includes(currency) ? wantingRate(book, currency) : `${currency}: bu valyuta yoqilmagan`
      if (wanting) {
        refuse(wanting)
        continue
      }
      // A balance from before the books is usually entered once: a second one is said, not refused.
      const [earlier]: unknown[] = await em.query(
        `SELECT 1 FROM customer_payments
         WHERE customer_id = $1 AND currency = $2 AND kind = 'opening' AND status = 'posted' AND client_key <> $3
         LIMIT 1`,
        [customer.id, currency, rowKey(input.clientKey, row.row)],
      )
      await this.payments.openingIn(em, actor, {
        clientKey: rowKey(input.clientKey, row.row),
        customerId: customer.id,
        currency,
        owes: row.owes,
        amount: row.amount,
        dueDate: row.dueDate,
        note: row.note,
      })
      const account = await em.findOneBy(Account, { customerId: customer.id, currency })
      created += Number(who.created)
      const sum = totals.get(currency) ?? { owes: 0, owed: 0 }
      totals.set(currency, {
        owes: sum.owes + Math.max(0, change),
        owed: sum.owed + Math.max(0, -change),
      })
      rows.push({
        ...said,
        customerName: customer.name,
        created: who.created,
        currency,
        balance: account?.balance ?? 0,
        again: !!earlier,
        problem: null,
      })
    }
    return {
      rows,
      created,
      totals: [...totals].map(([currency, sum]) => ({ currency, ...sum })),
      done: false,
    }
  }

  /**
   * Whose row it is: whoever has that phone; else the one customer of that name — unless they are known by
   * another phone, and so are somebody else; else someone new, written down by whoever may keep the book.
   */
  private async who(
    em: EntityManager,
    actor: Actor,
    row: OpeningRow,
    kept: AnyCurrency[],
  ): Promise<{ customer: Customer; created: boolean } | string> {
    const suppliers = 'Yetkazib beruvchining qoldig‘ini uning hisobini ko‘radigan xodim kiritadi'
    let customer = row.phone ? await em.findOneBy(Customer, { phone: row.phone }) : null
    if (!customer) {
      const named = await em
        .createQueryBuilder(Customer, 'c')
        .where('lower(c.name) = lower(:name)', { name: row.name })
        .andWhere('c.mergedInto IS NULL')
        .getMany()
      const standing = named.filter((item) => item.isActive)
      const among = standing.length ? standing : named
      if (among.length > 1) {
        return `«${row.name}» nomli mijoz bir nechta: telefoni bilan yozing`
      }
      const [one] = among
      if (one && !(row.phone && one.phone && one.phone !== row.phone)) {
        customer = one
      }
    }
    if (customer) {
      if ((customer.isSupplier || row.isSupplier) && !can(actor, 'customers.suppliers')) {
        return suppliers
      }
      if (row.isSupplier && !customer.isSupplier) {
        await em.update(Customer, customer.id, { isSupplier: true })
        customer.isSupplier = true
      }
      return { customer, created: false }
    }
    if (!can(actor, 'customers.manage')) {
      return `«${row.name}» mijozlar ro‘yxatida yo‘q`
    }
    if (row.isSupplier && !can(actor, 'customers.suppliers')) {
      return suppliers
    }
    const made = await this.customers.createIn(em, actor, {
      name: row.name,
      phone: row.phone,
      birthday: null,
      gender: null,
      note: null,
      groupIds: [],
      tags: [],
      priceTypeId: null,
      isSupplier: row.isSupplier,
      // Someone new deals in the currency their first balance is in, where the business keeps it.
      currency: row.currency && kept.includes(row.currency) ? row.currency : undefined,
    })
    return { customer: made, created: true }
  }
}
