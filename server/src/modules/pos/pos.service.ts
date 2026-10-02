import { DEFAULT_ORG_SETTINGS, normalizeEpc, type PosContextDto, type PosItemDto } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Organization, Register, Shift } from '../../database/entities'
import { can, type Actor } from '../auth/actor'
import { LedgerService } from '../money/ledger.service'
import { MoneyService } from '../money/money.service'
import { ShiftsService } from '../money/shifts.service'
import { sellables } from './items'

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

/** What the till screen asks for while a sale is being rung up. */
@Injectable()
export class PosService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly money: MoneyService,
    private readonly shifts: ShiftsService,
  ) {}

  /** Everything a till needs to start: its shift, the rate, where money can go, the shop's rules. */
  async context(actor: Actor, registerId: string): Promise<PosContextDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const register = await this.register(em, actor, registerId)
      const open = await em.findOneBy(Shift, { registerId, status: 'open' })
      const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
      const settings = { ...DEFAULT_ORG_SETTINGS, ...org.settings }
      const usd = actor.modules.includes('usd')
      const accounts = (await this.money.accountRows(em, false)).filter(
        (account) => account.isActive && (!account.locationId || account.locationId === register.locationId),
      )
      const sellers: { id: string; name: string }[] = await em.query(
        `SELECT u.id, u.full_name AS name FROM users u
         WHERE u.is_active
           AND (u.all_locations OR EXISTS (
             SELECT 1 FROM user_locations ul WHERE ul.user_id = u.id AND ul.location_id = $1
           ))
         ORDER BY u.full_name`,
        [register.locationId],
      )
      return {
        register: await this.money.registerRow(em, registerId),
        // The till shows its own shift whoever opened it; what the books expect stays hidden while it is open.
        shift: open ? await this.shifts.load(em, actor, open.id) : null,
        rate: usd ? await this.ledger.rate(em, await this.ledger.today(em, actor.orgId)) : null,
        usd,
        cards: accounts.filter((account) => account.kind === 'card'),
        terminals: accounts.filter((account) => account.kind === 'terminal'),
        sellers,
        changeRoundStep: settings.changeRoundStep,
        maxDiscountPercent: settings.maxDiscountPercent,
        mayOverDiscount: can(actor, 'pos.discount'),
      }
    })
  }

  /** What a cashier finds by typing a name, an article, a colour or a size. */
  async search(actor: Actor, registerId: string, q: string): Promise<PosItemDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const register = await this.register(em, actor, registerId)
      return sellables(em, { search: q, limit: 20 }, register.locationId, await this.rateNow(em, actor))
    })
  }

  /** The things in a cart as they are now: today's price, what is on hand. */
  async items(actor: Actor, registerId: string, variantIds: string[]): Promise<PosItemDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const register = await this.register(em, actor, registerId)
      return sellables(em, { ids: [...new Set(variantIds)] }, register.locationId, await this.rateNow(em, actor))
    })
  }

  /** What a scanned code is: a tagged piece, a barcode, or an article typed in full. */
  async lookup(actor: Actor, registerId: string, code: string): Promise<PosItemDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const register = await this.register(em, actor, registerId)
      const epc = normalizeEpc(code)
      let variantId: string | null = null
      let tag: string | null = null

      if (epc) {
        const [unit]: { variant_id: string; status: string; number: string | null }[] = await em.query(
          `SELECT u.variant_id, u.status, s.number FROM rfid_units u LEFT JOIN sales s ON s.id = u.sale_id
           WHERE u.epc = $1`,
          [epc],
        )
        if (unit?.status === 'sold') {
          throw AppError.conflict('UNIT_SOLD', `Bu dona sotilgan${unit.number ? ` (chek ${unit.number})` : ''}`)
        }
        if (unit?.status === 'ready') {
          throw AppError.conflict('UNIT_NOT_RECEIVED', "Bu dona hali kirim qilinmagan: kirim hujjati o'tkazilmagan")
        }
        if (unit?.status === 'in_stock') {
          variantId = unit.variant_id
          tag = epc
        }
      }
      if (!variantId) {
        const [found]: { id: string }[] = await em.query(
          `SELECT v.id FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN variant_barcodes c ON c.variant_id = v.id AND c.code = $1
           WHERE c.id IS NOT NULL OR lower(v.sku) = lower($1)
           ORDER BY (c.id IS NOT NULL) DESC, v.created_at
           LIMIT 1`,
          [code],
        )
        variantId = found?.id ?? null
      }
      const [item] = variantId
        ? await sellables(em, { ids: [variantId] }, register.locationId, await this.rateNow(em, actor))
        : []
      if (!item) {
        throw AppError.notFound(epc ? "Bu RFID belgi tizimda yo'q" : 'Bu kod bilan tovar topilmadi')
      }
      return { ...item, epc: tag }
    })
  }

  private async rateNow(em: EntityManager, actor: Actor): Promise<number | null> {
    if (!actor.modules.includes('usd')) {
      return null
    }
    return (await this.ledger.rate(em, await this.ledger.today(em, actor.orgId)))?.uzsPerUsd ?? null
  }

  private async register(em: EntityManager, actor: Actor, id: string): Promise<Register> {
    const register = await em.findOneBy(Register, { id })
    if (!register || !register.isActive || !mayWorkAt(actor, register.locationId)) {
      throw AppError.notFound('Kassa topilmadi')
    }
    return register
  }
}
