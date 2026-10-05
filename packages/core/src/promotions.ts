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

/** `percent`: so much off. `price`: every piece at one price. */
export const PROMOTION_KINDS = ['percent', 'price'] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

export const PROMOTION_KIND_LABELS: Record<PromotionKind, string> = {
  percent: 'Foizli chegirma',
  price: 'Belgilangan narx',
}

/** Where a promotion stands today. */
export const PROMOTION_STATES = ['scheduled', 'running', 'ended', 'stopped'] as const
export type PromotionState = (typeof PROMOTION_STATES)[number]

export const PROMOTION_STATE_LABELS: Record<PromotionState, string> = {
  scheduled: 'Kutilmoqda',
  running: 'Ketmoqda',
  ended: 'Tugagan',
  stopped: "To'xtatilgan",
}

const ids = z.array(idSchema).max(500).default([])

export const promotionInputSchema = z
  .object({
    /** Shown at the till and on the receipt. */
    name: requiredText(80),
    kind: z.enum(PROMOTION_KINDS),
    /** A percentage for `percent`; a price for one piece, in so'm tiyin, for `price`. */
    value: z.number().positive().max(1_000_000_000_000_00),
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
    if (promotion.kind === 'percent') {
      if (promotion.value > 100) {
        context.addIssue({ code: 'custom', path: ['value'], message: 'Foiz 100 dan oshmaydi' })
      }
      if (Math.abs(promotion.value * 100 - Math.round(promotion.value * 100)) > 1e-6) {
        context.addIssue({ code: 'custom', path: ['value'], message: "Foizda ko'pi bilan 2 ta kasr xona bo'ladi" })
      }
    } else if (!Number.isInteger(promotion.value)) {
      context.addIssue({ code: 'custom', path: ['value'], message: "Narx noto'g'ri" })
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
  stackable: boolean
}

/** What a promotion takes off a line of `qty` at `price`. A price set above the thing's own takes nothing off. */
export function promoOff(offer: PromoOffer, price: number, qty: number): number {
  const whole = gross(price, qty)
  return offer.kind === 'percent' ? customerOff(whole, offer.value) : Math.max(0, whole - gross(offer.value, qty))
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
export function lineAuto(price: number, qty: number, offers: readonly PromoOffer[], ownPercent: number): LineAuto {
  const whole = gross(price, qty)
  const own = customerOff(whole, ownPercent)
  let best: PromoOffer | null = null
  let off = 0
  for (const offer of offers) {
    const takes = promoOff(offer, price, qty)
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
