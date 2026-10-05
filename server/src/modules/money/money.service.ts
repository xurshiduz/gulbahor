import {
  ACCOUNT_KIND_LABELS,
  accountShops,
  type AccountDto,
  type AccountInput,
  type PaymentAccountDto,
  type RateDto,
  type RateInput,
  type RegisterDto,
  type RegisterInput,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Account, ExchangeRate, Location, Register, Shift } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { LedgerService } from './ledger.service'
import { mayUse } from './places'

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

/** An account as it is kept: the shops it serves, and the one shop of an account that has exactly one. */
function placed(input: AccountInput) {
  const { locationIds: _asked, ...rest } = input
  const shops = accountShops(input)
  return { ...rest, locationIds: shops, locationId: shops.length === 1 ? shops[0] : null }
}

/**
 * What a business sets up before it can sell: its tills, the cards and
 * terminals money can be paid to, and the day's dollar rate.
 */
@Injectable()
export class MoneyService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
  ) {}

  // ───────────────────────────── Tills ─────────────────────────────

  /** The tills in the shops this person works in. */
  async registers(actor: Actor): Promise<RegisterDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rows = await this.registerRows(em)
      return rows.filter((row) => mayWorkAt(actor, row.locationId))
    })
  }

  async createRegister(actor: Actor, input: RegisterInput): Promise<RegisterDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertRegister(em, input)
      // A shop's first till is its main one.
      const isMain = !(await em.existsBy(Register, { locationId: input.locationId, isMain: true }))
      const saved = await em.save(em.create(Register, { orgId: actor.orgId, ...input, isActive: true, isMain }))
      await this.audit.record(em, actor.orgId, actor, {
        action: 'register.create',
        entity: 'register',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      return this.registerRow(em, saved.id)
    })
  }

  async updateRegister(actor: Actor, id: string, input: RegisterInput): Promise<RegisterDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findRegister(em, id)
      if (before.locationId !== input.locationId && (await em.countBy(Shift, { registerId: id }))) {
        throw AppError.validation({ locationId: "Smenasi bo'lgan kassani boshqa do'konga o'tkazib bo'lmaydi" })
      }
      await this.assertRegister(em, input, id)
      if (before.locationId !== input.locationId) {
        // It leaves one shop and joins another: main in neither by right, and in the new one only if that has none.
        await em.update(Register, id, { isMain: false })
        await this.passMainOn(em, before.locationId, id)
        const isMain = !(await em.existsBy(Register, { locationId: input.locationId, isMain: true }))
        await em.update(Register, id, { ...input, isMain })
      } else {
        await em.update(Register, id, input)
      }
      await em.update(Account, { registerId: id }, { locationId: input.locationId, locationIds: [input.locationId] })
      const after = await this.findRegister(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'register.update',
        entity: 'register',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, ['name', 'locationId']),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      return this.registerRow(em, id)
    })
  }

  /** A till that is not used any more is put away, never deleted: its shifts and sales stay. */
  async setRegisterActive(actor: Actor, id: string, active: boolean): Promise<RegisterDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const register = await this.findRegister(em, id)
      if (!active && (await em.findOneBy(Shift, { registerId: id, status: 'open' }))) {
        throw AppError.conflict('SHIFT_OPEN', 'Bu kassada smena ochiq. Avval smenani yoping')
      }
      if (register.isActive !== active) {
        if (active) {
          const isMain = !(await em.existsBy(Register, { locationId: register.locationId, isMain: true }))
          await em.update(Register, id, { isActive: true, isMain })
        } else {
          // A till put away is nobody's main till: another of the shop's takes its place.
          await em.update(Register, id, { isActive: false, isMain: false })
          if (register.isMain) {
            await this.passMainOn(em, register.locationId, id)
          }
        }
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'register.restore' : 'register.archive',
          entity: 'register',
          entityId: id,
          summary: register.name,
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      }
      return this.registerRow(em, id)
    })
  }

  // ───────────────────────────── Accounts ─────────────────────────────

  /** Every place money is kept. System accounts are the ledger's own and are not listed. */
  async accounts(actor: Actor): Promise<AccountDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.accountRows(em, can(actor, 'money.view')))
  }

  async createAccount(actor: Actor, input: AccountInput): Promise<AccountDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertAccount(em, input)
      const saved = await em.save(
        em.create(Account, { orgId: actor.orgId, ...placed(input), balance: 0, isActive: true }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'account.create',
        entity: 'account',
        entityId: saved.id,
        summary: `${ACCOUNT_KIND_LABELS[saved.kind]}: ${saved.name}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      return this.accountRow(em, saved.id, true)
    })
  }

  async updateAccount(actor: Actor, id: string, input: AccountInput): Promise<AccountDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findAccount(em, id)
      const changes = before.kind !== input.kind || before.currency !== input.currency
      if (changes && (await this.ledger.isUsed(em, id))) {
        throw AppError.validation(
          before.kind !== input.kind
            ? { kind: "Pul o'tgan hisobning turini o'zgartirib bo'lmaydi" }
            : { currency: "Pul o'tgan hisobning valyutasini o'zgartirib bo'lmaydi" },
        )
      }
      await this.assertAccount(em, input, id)
      await em.update(Account, id, placed(input))
      const after = await this.findAccount(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'account.update',
        entity: 'account',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, ['kind', 'name', 'currency', 'locationIds', 'last4', 'bank']),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      return this.accountRow(em, id, true)
    })
  }

  async setAccountActive(actor: Actor, id: string, active: boolean): Promise<AccountDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const account = await this.findAccount(em, id)
      if (account.isActive !== active) {
        await em.update(Account, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'account.restore' : 'account.archive',
          entity: 'account',
          entityId: id,
          summary: account.name,
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      }
      return this.accountRow(em, id, true)
    })
  }

  // ───────────────────────────── Rates ─────────────────────────────

  /** Today's rate and the ones before it, newest first. */
  async rates(actor: Actor): Promise<{ current: RateDto | null; history: RateDto[] }> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const history = await em.find(ExchangeRate, { order: { rateDate: 'DESC' }, take: 60 })
      return {
        current: await this.ledger.rate(em, await this.ledger.today(em, actor.orgId)),
        history: history.map((rate) => ({ date: rate.rateDate, uzsPerUsd: rate.uzsPerUsd, setByName: rate.setByName })),
      }
    })
  }

  /** Sets the rate of a day; a day already past keeps the rate its sales were made at. */
  async setRate(actor: Actor, input: RateInput): Promise<RateDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const today = await this.ledger.today(em, actor.orgId)
      if (input.date < today) {
        throw AppError.validation({ date: "O'tgan kunning kursi o'zgartirilmaydi" })
      }
      const before = await em.findOneBy(ExchangeRate, { rateDate: input.date })
      await em.query(
        `INSERT INTO exchange_rates (org_id, rate_date, uzs_per_usd, set_by, set_by_name) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (org_id, rate_date)
         DO UPDATE SET uzs_per_usd = EXCLUDED.uzs_per_usd, set_by = EXCLUDED.set_by, set_by_name = EXCLUDED.set_by_name`,
        [actor.orgId, input.date, input.uzsPerUsd, actor.userId, actor.name],
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'rate.set',
        entity: 'rate',
        summary: `${input.date}: 1 $ = ${input.uzsPerUsd} so'm`,
        changes: before ? { uzsPerUsd: [before.uzsPerUsd, input.uzsPerUsd] } : null,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money', 'pos']))
      return { date: input.date, uzsPerUsd: input.uzsPerUsd, setByName: actor.name }
    })
  }

  // ───────────────────────────── Reading ─────────────────────────────

  async findRegister(em: EntityManager, id: string): Promise<Register> {
    const register = await em.findOneBy(Register, { id })
    if (!register) {
      throw AppError.notFound('Kassa topilmadi')
    }
    return register
  }

  /** Makes a till its shop's main one; the one that was main stops being it. */
  async setMainRegister(actor: Actor, id: string): Promise<RegisterDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const register = await this.findRegister(em, id)
      if (!register.isActive) {
        throw AppError.conflict('REGISTER_ARCHIVED', "Arxivdagi kassa asosiy bo'la olmaydi")
      }
      if (!register.isMain) {
        await em.update(Register, { locationId: register.locationId, isMain: true }, { isMain: false })
        await em.update(Register, id, { isMain: true })
        await this.audit.record(em, actor.orgId, actor, {
          action: 'register.main',
          entity: 'register',
          entityId: id,
          summary: register.name,
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      }
      return this.registerRow(em, id)
    })
  }

  /** A shop whose main till is gone gets another: the oldest of those still in use, if there is one. */
  private async passMainOn(em: EntityManager, locationId: string, fromId: string): Promise<void> {
    const [next]: { id: string }[] = await em.query(
      `SELECT id FROM registers WHERE location_id = $1 AND is_active AND id <> $2 ORDER BY created_at, id LIMIT 1`,
      [locationId, fromId],
    )
    if (next) {
      await em.update(Register, next.id, { isMain: true })
    }
  }

  /**
   * The places a person may pay through or take money into, for a window
   * that lays them out: whether each can take money now, and whose drawer a
   * till's is. Balances only for those who may see them.
   */
  async paymentAccounts(em: EntityManager, actor: Actor, kinds: string[]): Promise<PaymentAccountDto[]> {
    const rows = await this.accountRows(em, can(actor, 'money.view'))
    const tills = await em.find(Register, { select: { id: true, name: true, isMain: true } })
    const tillOf = new Map(tills.map((till) => [till.id, till]))
    const shifts = await em.find(Shift, {
      where: { status: 'open' },
      select: { registerId: true, openedBy: true },
    })
    const open = new Set(shifts.map((shift) => shift.registerId))
    const mine = new Set(shifts.filter((shift) => shift.openedBy === actor.userId).map((shift) => shift.registerId))
    return rows
      .filter((account) => account.isActive && kinds.includes(account.kind) && mayUse(actor, account))
      .map((account) => {
        const till = account.registerId ? tillOf.get(account.registerId) : undefined
        return {
          ...account,
          open: account.kind !== 'cash' || open.has(account.registerId as string),
          till: till ? { name: till.name, main: till.isMain, mine: mine.has(till.id) } : null,
        }
      })
  }

  private async registerRows(em: EntityManager, id?: string): Promise<RegisterDto[]> {
    const qb = em
      .createQueryBuilder(Register, 'r')
      .innerJoin(Location, 'l', 'l.id = r.locationId')
      .leftJoin(Shift, 's', `s.registerId = r.id AND s.status = 'open'`)
      .addSelect('l.name', 'location_name')
      .addSelect('s.id', 'shift_id')
      .addSelect('s.number', 'shift_number')
      .addSelect('s.openedAt', 'shift_opened_at')
      .addSelect('s.openedByName', 'shift_opened_by')
      .orderBy('l.name')
      .addOrderBy('r.name')
    if (id) qb.where('r.id = :id', { id })
    const { entities, raw } = await qb.getRawAndEntities()
    return entities.map((register, index) => ({
      id: register.id,
      name: register.name,
      locationId: register.locationId,
      locationName: raw[index].location_name,
      isActive: register.isActive,
      isMain: register.isMain,
      shift: raw[index].shift_id
        ? {
            id: raw[index].shift_id,
            number: raw[index].shift_number,
            openedAt: new Date(raw[index].shift_opened_at).toISOString(),
            openedByName: raw[index].shift_opened_by,
          }
        : null,
    }))
  }

  async registerRow(em: EntityManager, id: string): Promise<RegisterDto> {
    const [row] = await this.registerRows(em, id)
    if (!row) {
      throw AppError.notFound('Kassa topilmadi')
    }
    return row
  }

  async accountRows(em: EntityManager, seesBalances: boolean, id?: string): Promise<AccountDto[]> {
    const qb = em
      .createQueryBuilder(Account, 'a')
      .leftJoin(Location, 'l', 'l.id = a.locationId')
      .addSelect('l.name', 'location_name')
      // The ledger's own accounts and partners' accounts are not places money is kept.
      .where(`a.kind NOT IN ('system', 'partner')`)
      .orderBy(`array_position(ARRAY['cash', 'safe', 'card', 'terminal', 'bank'], a.kind)`)
      .addOrderBy('l.name', 'ASC', 'NULLS FIRST')
      .addOrderBy('a.name')
    if (id) qb.andWhere('a.id = :id', { id })
    const { entities, raw } = await qb.getRawAndEntities()
    const shared = [...new Set(entities.flatMap((account) => account.locationIds))]
    const places = shared.length ? await em.find(Location, { where: { id: In(shared) }, select: ['id', 'name'] }) : []
    const nameOf = new Map(places.map((place) => [place.id, place.name]))
    return entities.map((account, index) => ({
      id: account.id,
      kind: account.kind,
      name: account.name,
      currency: account.currency,
      locationId: account.locationId,
      locationName: raw[index].location_name,
      locationIds: account.locationIds,
      locationNames: account.locationIds.flatMap((id) => nameOf.get(id) ?? []).sort((a, b) => a.localeCompare(b)),
      registerId: account.registerId,
      last4: account.last4,
      bank: account.bank,
      balance: seesBalances ? account.balance : null,
      isActive: account.isActive,
    }))
  }

  private async accountRow(em: EntityManager, id: string, seesBalances: boolean): Promise<AccountDto> {
    const [row] = await this.accountRows(em, seesBalances, id)
    return row
  }

  /** A card, a terminal, a safe: one of the accounts a person keeps. A till's drawer is the till's. */
  private async findAccount(em: EntityManager, id: string): Promise<Account> {
    const account = await em.findOneBy(Account, { id })
    if (!account || account.kind === 'system' || account.kind === 'partner' || account.kind === 'cash') {
      throw AppError.notFound('Hisob topilmadi')
    }
    return account
  }

  private async assertRegister(em: EntityManager, input: RegisterInput, exceptId?: string) {
    const [place]: { kind: string }[] = await em.query(`SELECT kind FROM locations WHERE id = $1 AND is_active`, [
      input.locationId,
    ])
    if (!place || place.kind === 'transit') {
      throw AppError.validation({ locationId: "Do'kon topilmadi" })
    }
    if (place.kind === 'warehouse') {
      throw AppError.validation({ locationId: "Skladda kassa bo'lmaydi. Joy turini «Do'kon va sklad» qiling" })
    }
    const [taken] = await em.query(
      `SELECT 1 FROM registers WHERE location_id = $1 AND lower(name) = lower($2) AND id IS DISTINCT FROM $3`,
      [input.locationId, input.name, exceptId ?? null],
    )
    if (taken) {
      throw AppError.validation({ name: "Bu do'konda shunday nomli kassa bor" })
    }
  }

  private async assertAccount(em: EntityManager, input: AccountInput, exceptId?: string) {
    const shops = accountShops(input)
    if (shops.length) {
      const [{ found }]: { found: number }[] = await em.query(
        `SELECT count(*)::int AS found FROM locations WHERE id = ANY($1) AND kind <> 'transit'`,
        [shops],
      )
      if (found !== shops.length) {
        throw AppError.validation({ [input.locationIds.length ? 'locationIds' : 'locationId']: 'Joy topilmadi' })
      }
    }
    const [taken] = await em.query(
      `SELECT 1 FROM accounts WHERE kind <> 'system' AND lower(name) = lower($1) AND id IS DISTINCT FROM $2`,
      [input.name, exceptId ?? null],
    )
    if (taken) {
      throw AppError.validation({ name: 'Bunday nomli hisob bor' })
    }
  }
}
