import {
  combinations,
  type AttributeDto,
  type CurrencyCode,
  type PriceDto,
  type PriceInput,
  type ProductDto,
  type VariantInput,
} from '@erp/core'

/**
 * The part of the model form that is not plain fields: which values of each
 * axis are in play, which of their combinations exist as variants, and what
 * is known about each variant. Everything here is a pure function of the
 * previous state, so the form can keep it in one `useState`.
 */

export interface PriceDraft {
  amount: number | null
  currency: CurrencyCode
}

export type PriceDrafts = Record<string, PriceDraft>

export interface VariantDraft {
  /** Null until the variant is saved for the first time. */
  id: string | null
  sku: string
  barcodes: string[]
  isActive: boolean
  prices: PriceDrafts
}

export interface VariantState {
  axisIds: string[]
  /** For each axis, the values offered in the matrix. */
  selected: string[][]
  /** Variants that exist, by `keyOf(valueIds)`. */
  variants: Record<string, VariantDraft>
  /** Saved variants as they were loaded, so one unticked by mistake comes back as itself. */
  saved: Record<string, VariantDraft>
}

const SEPARATOR = '|'

export const keyOf = (valueIds: readonly string[]) => valueIds.join(SEPARATOR)
export const valueIdsOf = (key: string) => (key ? key.split(SEPARATOR) : [])

const blank = (): VariantDraft => ({ id: null, sku: '', barcodes: [], isActive: true, prices: {} })

export function toPriceDrafts(prices: PriceDto[]): PriceDrafts {
  return Object.fromEntries(
    prices.map((price) => [price.priceTypeId, { amount: price.amount, currency: price.currency }]),
  )
}

export function toPriceInputs(drafts: PriceDrafts): PriceInput[] {
  return Object.entries(drafts).flatMap(([priceTypeId, draft]) =>
    draft.amount === null ? [] : [{ priceTypeId, amount: draft.amount, currency: draft.currency }],
  )
}

/** A model with these axes and nothing chosen yet. Without axes there is always exactly one variant. */
export function emptyState(axisIds: string[]): VariantState {
  return { axisIds, selected: axisIds.map(() => []), variants: axisIds.length ? {} : { '': blank() }, saved: {} }
}

export function stateOf(product: ProductDto): VariantState {
  const variants: Record<string, VariantDraft> = {}
  for (const variant of product.variants) {
    variants[keyOf(variant.valueIds)] = {
      id: variant.id,
      sku: variant.sku,
      barcodes: variant.barcodes,
      isActive: variant.isActive,
      prices: toPriceDrafts(variant.prices),
    }
  }
  return {
    axisIds: product.axisIds,
    selected: product.axisIds.map((_axis, position) => [
      ...new Set(product.variants.map((variant) => variant.valueIds[position])),
    ]),
    variants,
    saved: { ...variants },
  }
}

/** The same axes and values for the next model, with fresh variants. */
export function carryOver(state: VariantState): VariantState {
  const variants = Object.fromEntries(Object.keys(state.variants).map((key) => [key, blank()]))
  return { axisIds: state.axisIds, selected: state.selected, variants, saved: {} }
}

export function hasSavedVariants(state: VariantState): boolean {
  return Object.keys(state.saved).length > 0
}

/** Changing the axes starts the variants over; it is offered only while nothing is saved. */
export function withAxes(state: VariantState, axisIds: string[]): VariantState {
  if (keyOf(axisIds) === keyOf(state.axisIds)) {
    return state
  }
  const next = emptyState(axisIds)
  // An axis that stays keeps the values already picked for it.
  next.selected = axisIds.map((axisId) => {
    const before = state.axisIds.indexOf(axisId)
    return before === -1 ? [] : state.selected[before]
  })
  if (axisIds.length) {
    next.variants = Object.fromEntries(combinations(next.selected).map((valueIds) => [keyOf(valueIds), blank()]))
  }
  return next
}

/**
 * Sets the values offered for one axis. A value that was just added brings
 * all its combinations with it; a value taken away takes its variants along.
 */
export function withSelected(state: VariantState, axis: number, valueIds: string[]): VariantState {
  const before = new Set(state.selected[axis])
  const after = new Set(valueIds)
  const selected = state.selected.map((values, position) => (position === axis ? valueIds : values))

  const variants: Record<string, VariantDraft> = {}
  for (const [key, draft] of Object.entries(state.variants)) {
    if (after.has(valueIdsOf(key)[axis])) {
      variants[key] = draft
    }
  }
  const added = valueIds.filter((valueId) => !before.has(valueId))
  if (added.length) {
    const lists = selected.map((values, position) => (position === axis ? added : values))
    for (const combination of combinations(lists)) {
      const key = keyOf(combination)
      variants[key] = state.saved[key] ?? blank()
    }
  }
  return { ...state, selected, variants }
}

/** Ticks or unticks combinations in the matrix. */
export function withVariants(state: VariantState, keys: string[], on: boolean): VariantState {
  const variants = { ...state.variants }
  for (const key of keys) {
    if (on) {
      variants[key] ??= state.saved[key] ?? blank()
    } else {
      delete variants[key]
    }
  }
  return { ...state, variants }
}

export function withDraft(state: VariantState, key: string, patch: Partial<VariantDraft>): VariantState {
  return { ...state, variants: { ...state.variants, [key]: { ...state.variants[key], ...patch } } }
}

/** Each axis's chosen values in the attribute's own order, so sizes run S, M, L whatever order they were picked in. */
export function orderedSelection(state: VariantState, attributes: AttributeDto[]): string[][] {
  return state.axisIds.map((axisId, position) => {
    const order = attributes.find((attribute) => attribute.id === axisId)?.values.map((value) => value.id) ?? []
    const rank = (valueId: string) => {
      const index = order.indexOf(valueId)
      return index === -1 ? order.length : index
    }
    return [...state.selected[position]].sort((a, b) => rank(a) - rank(b))
  })
}

/** The keys of the variants that exist, in matrix order. */
export function orderedKeys(state: VariantState, attributes: AttributeDto[]): string[] {
  if (!state.axisIds.length) {
    return ['']
  }
  return combinations(orderedSelection(state, attributes))
    .map(keyOf)
    .filter((key) => key in state.variants)
}

export function toVariantInputs(state: VariantState, keys: string[]): VariantInput[] {
  return keys.map((key) => {
    const draft = state.variants[key]
    const sku = draft.sku.trim()
    return {
      id: draft.id,
      valueIds: valueIdsOf(key),
      // An article nobody touched is left for the server to keep, so automatic ones still follow the model's.
      sku: sku && sku !== state.saved[key]?.sku ? sku : null,
      barcodes: draft.barcodes,
      isActive: draft.isActive,
      prices: toPriceInputs(draft.prices),
    }
  })
}

/** Saved variants that the current matrix no longer contains: saving will remove them. */
export function removedCount(state: VariantState): number {
  return Object.keys(state.saved).filter((key) => !(key in state.variants)).length
}
