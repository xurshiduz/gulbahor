import { z } from 'zod'

import { SEASONS } from './catalog'
import { customerOff, gross } from './pos'
import { idSchema, listQuerySchema, optionalText, requiredText } from './schemas'

/**
 * Promotions: for a while, in some shops, some goods are cheaper. A
 * promotion starts and ends by itself on the days it names. At the till it
 * comes off by itself, like a customer's own discount; the two are not added
 * together unless the promotion says so: the customer gets whichever is more.
 */

/**
 * `percent`: so much off. `price`: every piece at one price. `pair`: of every two pieces taken, the cheaper
 * is so much off ("1+1": at 100% it is free). `quantity`: so much off once so many pieces are taken.
 */
export const PROMOTION_KINDS = ['percent', 'price', 'pair', 'quantity'] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

export const PROMOTION_KIND_LABELS: Record<PromotionKind, string> = {
  percent: 'Foizli chegirma',
  price: 'Belgilangan narx',
  pair: '1+1: ikkinchisiga chegirma',
  quantity: 'Bir nechta olinsa chegirma',
}

/** The kinds that are worked out over the whole cart, not line by line. */
const CART_KINDS: readonly PromotionKind[] = ['pair', 'quantity']

/** Where a promotion stands today. */
export const PROMOTION_STATES = ['scheduled', 'running', 'ended', 'stopped'] as const
export type PromotionState = (typeof PROMOTION_STATES)[number]

export const PROMOTION_STATE_LABELS: Record<PromotionState, string> = {
  scheduled: 'Kutilmoqda',
  running: 'Ketmoqda',
  ended: 'Tugagan',
  stopped: 'To‘xtatilgan',
}

const ids = z.array(idSchema).max(500).default([])

export const promotionInputSchema = z
  .object({
    /** Shown at the till and on the receipt. */
    name: requiredText(80),
    kind: z.enum(PROMOTION_KINDS),
    /** A price for one piece, in so'm tiyin, for `price`; a percentage for every other kind. */
    value: z.number().positive().max(1_000_000_000_000_00),
    /** For `quantity`: how many pieces have to be taken for it to work. */
    minQty: z
      .number()
      .int()
      .min(2)
      .max(1000)
      .nullish()
      .transform((value) => value ?? null),
    /** The first and the last day it is in force, by the business's calendar; no last day runs until stopped. */
    startsOn: z.iso.date(),
    endsOn: z.iso
      .date()
      .nullish()
      .transform((value) => value ?? null),
    /** The shops it runs in; none for every shop. */
    locationIds: ids,
    /**
     * The goods it covers. A model on the list is always covered. Otherwise a model is covered when it fits
     * every one of the conditions that are set: one of the categories (or anything under them), one of the
     * brands, one of the seasons. With nothing set at all, everything is covered.
     */
    productIds: ids,
    categoryIds: ids,
    brandIds: ids,
    seasons: z.array(z.enum(SEASONS)).max(SEASONS.length).default([]),
    /** Comes off as well as the customer's own discount, one after the other; otherwise the greater of the two does. */
    stackable: z.boolean().default(false),
    /** A word the customer has to say for it to work; none for one that works for everybody. */
    code: optionalText(30).transform((value) => (value ? value.toUpperCase() : null)),
  })
  .superRefine((promotion, context) => {
    if (promotion.kind === 'quantity' && !promotion.minQty) {
      context.addIssue({ code: 'custom', path: ['minQty'], message: 'Nechta olinganda ishlashini kiriting' })
    }
    if (promotion.kind !== 'price') {
      if (promotion.value > 100) {
        context.addIssue({ code: 'custom', path: ['value'], message: 'Foiz 100 dan oshmaydi' })
      }
      if (Math.abs(promotion.value * 100 - Math.round(promotion.value * 100)) > 1e-6) {
        context.addIssue({ code: 'custom', path: ['value'], message: 'Foizda ko‘pi bilan 2 ta kasr xona bo‘ladi' })
      }
    } else if (!Number.isInteger(promotion.value)) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'Narx noto‘g‘ri' })
    }
    if (promotion.endsOn && promotion.endsOn < promotion.startsOn) {
      context.addIssue({ code: 'custom', path: ['endsOn'], message: 'Tugash kuni boshlanishidan oldin' })
    }
  })
export type PromotionInput = z.infer<typeof promotionInputSchema>

export const promotionListQuerySchema = listQuerySchema.extend({
  state: z.enum(['all', ...PROMOTION_STATES]).default('all'),
})
export type PromotionListQuery = z.infer<typeof promotionListQuerySchema>

export interface PromotionDto {
  id: string
  name: string
  kind: PromotionKind
  value: number
  minQty: number | null
  startsOn: string
  endsOn: string | null
  locationIds: string[]
  productIds: string[]
  /** The models on the list, by name, for the form. */
  products: { id: string; name: string; sku: string }[]
  categoryIds: string[]
  brandIds: string[]
  seasons: (typeof SEASONS)[number][]
  stackable: boolean
  code: string | null
  isActive: boolean
  state: PromotionState
  createdByName: string | null
  /** What it has taken off so far, on how many receipts. */
  given: number
  sales: number
}

/** Where a promotion stands on a day. */
export function promotionState(
  promotion: { startsOn: string; endsOn: string | null; isActive: boolean },
  today: string,
): PromotionState {
  if (!promotion.isActive) {
    return 'stopped'
  }
  if (today < promotion.startsOn) {
    return 'scheduled'
  }
  return promotion.endsOn && today > promotion.endsOn ? 'ended' : 'running'
}

// ───────────────────────────── At the till ─────────────────────────────

/** A promotion in force for one thing at one till: what the till needs to take it off. */
export interface PromoOffer {
  id: string
  name: string
  kind: PromotionKind
  value: number
  /** For `quantity`: how many pieces have to be taken. */
  minQty?: number | null
  stackable: boolean
}

/**
 * What a promotion takes off a line of `qty` at `price`, looking at that line alone. A price set above the
 * thing's own takes nothing off; a promotion that looks at the whole cart takes nothing off here.
 */
export function promoOff(offer: PromoOffer, price: number, qty: number): number {
  const whole = gross(price, qty)
  if (offer.kind === 'percent') {
    return customerOff(whole, offer.value)
  }
  return offer.kind === 'price' ? Math.max(0, whole - gross(offer.value, qty)) : 0
}

export interface LineAuto {
  /** Everything that comes off the line by itself. */
  auto: number
  /** The promotion that took part in it, and how much of it is the promotion's. */
  promo: PromoOffer | null
  promoOff: number
  /** How much of it is the customer's own discount. */
  ownOff: number
}

/**
 * What comes off a line by itself. Of the promotions in force the one that
 * takes most off is used. Beside the customer's own discount it does not add
 * up: whichever is more comes off, unless the promotion is one that stacks,
 * and then the customer's percentage is taken from what the promotion left.
 */
export function lineAuto(
  price: number,
  qty: number,
  offers: readonly PromoOffer[],
  ownPercent: number,
  /** What each promotion that looks at the whole cart takes off this line, by promotion id. */
  shares: ReadonlyMap<string, number> = new Map(),
): LineAuto {
  const whole = gross(price, qty)
  const own = customerOff(whole, ownPercent)
  let best: PromoOffer | null = null
  let off = 0
  for (const offer of offers) {
    const takes = CART_KINDS.includes(offer.kind) ? (shares.get(offer.id) ?? 0) : promoOff(offer, price, qty)
    if (takes > off) {
      best = offer
      off = takes
    }
  }
  if (!best) {
    return { auto: own, promo: null, promoOff: 0, ownOff: own }
  }
  if (best.stackable) {
    const after = customerOff(whole - off, ownPercent)
    return { auto: off + after, promo: best, promoOff: off, ownOff: after }
  }
  // Equal, the promotion is named: it is what the shop is running.
  return off >= own
    ? { auto: off, promo: best, promoOff: off, ownOff: 0 }
    : { auto: own, promo: null, promoOff: 0, ownOff: own }
}

/** A line of a cart, as far as promotions care. */
export interface PromoLine {
  price: number
  qty: number
  offers: readonly PromoOffer[]
}

/**
 * What a promotion that looks at the whole cart takes off each line it covers. Only whole pieces count: half
 * a metre of cloth is not "the second one".
 *
 * `pair`: the pieces it covers are laid out dearest first and taken two by two; the cheaper of each two is
 * so much off, and an odd one out is left as it is. `quantity`: once so many pieces are in the cart, every
 * one of them is so much off.
 */
function cartShares(offer: PromoOffer, lines: readonly PromoLine[]): Map<number, number> {
  const covered = lines.flatMap((line, index) =>
    line.offers.some((item) => item.id === offer.id)
      ? [{ index, price: line.price, pieces: Math.floor(line.qty) }]
      : [],
  )
  const shares = new Map<number, number>()
  if (offer.kind === 'quantity') {
    const pieces = covered.reduce((sum, line) => sum + line.pieces, 0)
    if (pieces >= (offer.minQty ?? Infinity)) {
      for (const line of covered) {
        shares.set(line.index, customerOff(gross(line.price, line.pieces), offer.value))
      }
    }
    return shares
  }
  const pieces = covered
    .flatMap((line) => Array.from({ length: line.pieces }, () => line))
    // Dearest first; among equals, in the order they stand in the cart, so both sides pair them alike.
    .sort((a, b) => b.price - a.price || a.index - b.index)
  for (let second = 1; second < pieces.length; second += 2) {
    const piece = pieces[second]
    shares.set(piece.index, (shares.get(piece.index) ?? 0) + customerOff(piece.price, offer.value))
  }
  return shares
}

/**
 * What comes off every line of a cart by itself. Each line is given the promotion that takes most off it,
 * whether one that looks at the line alone or one that looks at the whole cart; then the customer's own
 * discount is set beside it, as `lineAuto` does. The till and the server both work it out here.
 */
export function cartAutos(lines: readonly PromoLine[], ownPercent: number): LineAuto[] {
  const wide = new Map<string, PromoOffer>()
  for (const line of lines) {
    for (const offer of line.offers) {
      if (CART_KINDS.includes(offer.kind)) {
        wide.set(offer.id, offer)
      }
    }
  }
  const shares = lines.map(() => new Map<string, number>())
  for (const offer of wide.values()) {
    cartShares(offer, lines).forEach((off, index) => shares[index].set(offer.id, off))
  }
  return lines.map((line, index) => lineAuto(line.price, line.qty, line.offers, ownPercent, shares[index]))
}

/** What a model is, as far as promotions care. */
export interface PromoSubject {
  productId: string
  /** Its category and every category above it. */
  categoryIds: string[]
  brandId: string | null
  season: string | null
}

/** Whether a promotion covers a model: see `promotionInputSchema` for the rule. */
export function promotionCovers(
  promotion: { productIds: string[]; categoryIds: string[]; brandIds: string[]; seasons: string[] },
  subject: PromoSubject,
): boolean {
  if (promotion.productIds.includes(subject.productId)) {
    return true
  }
  const conditions = [
    promotion.categoryIds.length ? promotion.categoryIds.some((id) => subject.categoryIds.includes(id)) : null,
    promotion.brandIds.length ? !!subject.brandId && promotion.brandIds.includes(subject.brandId) : null,
    promotion.seasons.length ? !!subject.season && promotion.seasons.includes(subject.season) : null,
  ].filter((condition) => condition !== null)
  // A list alone covers what is on it and nothing else.
  return conditions.length ? conditions.every(Boolean) : !promotion.productIds.length
}
