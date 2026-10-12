import { formatMoney, worthInBase, type CustomerDto, type CustomerMergeInput } from '@erp/core'
import { Injectable } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Account, Customer, CustomerGroupMember } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { CurrenciesService } from '../money/currencies.service'
import { CUSTOMER_MERGE, LedgerService } from '../money/ledger.service'
import { RealtimeService } from '../realtime/realtime.service'
import { CustomersService, keyOf } from './customers.service'

/**
 * One person written down twice is made one (KEYINGI-REJA, 16, decision 23).
 * The one that goes is put away for good; what stood on each of their accounts
 * goes, by an entry of its own, to the other's account in the same currency —
 * nothing written before is changed. Their receipts, the days their debts fall
 * due and the goods received from them are the other's from then on, and so is
 * whatever still reaches their old accounts (`LedgerService.post` carries it
 * on). Two currencies are never added together here: that is an exchange
 * inside the account, done afterwards by whoever decides the rate.
 */
@Injectable()
export class CustomerMergeService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly currencies: CurrenciesService,
    private readonly ledger: LedgerService,
    private readonly customers: CustomersService,
  ) {}

  async merge(actor: Actor, id: string, input: CustomerMergeInput): Promise<CustomerDto> {
    if (id === input.intoId) {
      throw AppError.validation({ intoId: 'Mijozni o‘ziga birlashtirib bo‘lmaydi' })
    }
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      // Both are held, always in the same order: no sale or payment moves either account meanwhile.
      for (const each of [id, input.intoId].sort()) {
        await em.query(`SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`, [each])
      }
      const gone = await em.findOneBy(Customer, { id })
      if (!gone) {
        throw AppError.notFound('Mijoz topilmadi')
      }
      const kept = await em.findOneBy(Customer, { id: input.intoId })
      if (!kept) {
        throw AppError.validation({ intoId: 'Mijoz topilmadi' })
      }
      if (gone.mergedInto) {
        throw AppError.conflict('CUSTOMER_MERGED', `${gone.name} allaqachon birlashtirilgan`)
      }
      if (kept.mergedInto || !kept.isActive) {
        throw AppError.validation({
          intoId: kept.mergedInto ? `${kept.name} boshqa mijozga birlashtirilgan` : `${kept.name} arxivda`,
        })
      }
      // A supplier's sums are for those who keep suppliers' accounts: so is making one of them part of another.
      if ((gone.isSupplier || kept.isSupplier) && !can(actor, 'customers.suppliers')) {
        throw AppError.forbidden('Yetkazib beruvchini uning hisobini ko‘radigan xodim birlashtiradi')
      }

      const today = await this.ledger.today(em, actor.orgId)
      const book = await this.currencies.book(em, actor, today)
      // Whoever was merged into the one going is, from now on, the one staying.
      await em.query(`UPDATE customers SET merged_into = $2 WHERE merged_into = $1`, [gone.id, kept.id])

      const moved: string[] = []
      for (const account of await em.findBy(Account, { customerId: gone.id })) {
        if (!account.balance) {
          continue
        }
        const theirs = await this.ledger.customerAccount(em, kept, account.currency)
        // Both sides in one currency: whatever the rate, the entry comes to nothing in the base.
        const base = worthInBase(account.balance, account.currency, book) ?? 0
        await this.ledger.post(
          em,
          actor,
          {
            date: today,
            kind: CUSTOMER_MERGE,
            documentType: CUSTOMER_MERGE,
            documentId: gone.id,
            note: `${gone.name} → ${kept.name}`,
          },
          [
            { accountId: account.id, amount: -account.balance, base: -base },
            { accountId: theirs.id, amount: account.balance, base },
          ],
        )
        moved.push(formatMoney(account.balance, account.currency))
      }

      // What was the one's is the other's: receipts (and with them what was bought, and where goods brought back
      // are set off), the days debts fall due, goods received from them.
      for (const [table, column] of [
        ['sales', 'customer_id'],
        ['customer_dues', 'customer_id'],
        ['receipts', 'supplier_id'],
        ['receipt_lines', 'supplier_id'],
      ]) {
        await em.query(`UPDATE ${table} SET ${column} = $2 WHERE ${column} = $1`, [gone.id, kept.id])
      }
      await em.query(
        `INSERT INTO customer_group_members (org_id, customer_id, group_id)
         SELECT org_id, $2, group_id FROM customer_group_members WHERE customer_id = $1
         ON CONFLICT DO NOTHING`,
        [gone.id, kept.id],
      )
      await em.delete(CustomerGroupMember, { customerId: gone.id })

      // The card that stays is filled in from the one that goes where it says nothing; a second phone and a
      // second note are kept as notes.
      const phone = kept.phone ?? gone.phone
      const notes = [
        kept.note,
        gone.note && gone.note !== kept.note ? gone.note : null,
        gone.phone && gone.phone !== phone ? `${gone.name}: ${gone.phone}` : null,
      ].filter(Boolean)
      const card = {
        phone,
        birthday: kept.birthday ?? gone.birthday,
        gender: kept.gender ?? gone.gender,
        priceTypeId: kept.priceTypeId ?? gone.priceTypeId,
        isSupplier: kept.isSupplier || gone.isSupplier,
        tags: [...new Set([...kept.tags, ...gone.tags])],
        note: notes.length ? notes.join('\n').slice(0, 300) : null,
      }
      // The phone is one customer's alone: it leaves the first card before it is written on the second.
      await em.update(Customer, gone.id, { phone: null, isActive: false, mergedInto: kept.id, mergedAt: new Date() })
      await em.update(Customer, kept.id, { ...card, searchKey: keyOf({ ...card, name: kept.name }) })

      const summary = `${gone.name} → ${kept.name}${moved.length ? ` (${moved.join(', ')})` : ''}`
      for (const entityId of [gone.id, kept.id]) {
        await this.audit.record(em, actor.orgId, actor, {
          action: 'customer.merge',
          entity: 'customer',
          entityId,
          summary,
        })
      }
      afterCommit(() => this.realtime.changed(actor.orgId, ['customers', 'sales', 'receipts', 'customer-payments']))
      return this.customers.dtoOf(em, actor, await em.findOneByOrFail(Customer, { id: kept.id }))
    })
  }
}
