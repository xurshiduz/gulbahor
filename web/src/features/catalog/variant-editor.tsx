import {
  barcodeSchema,
  combinations,
  MAX_AXES,
  MAX_BARCODES,
  variantLabel,
  type AttributeDto,
  type AttributeValueDto,
  type CurrencyCode,
  type PriceTypeDto,
} from '@erp/core'
import { Check, Plus, X } from 'lucide-react'
import { memo, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ColorDot, Combobox } from '@/components/ui/combobox'
import { Menu, Select, Switch } from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { TagInput } from '@/components/ui/tag-input'
import { cn } from '@/lib/cn'

import {
  keyOf,
  orderedKeys,
  orderedSelection,
  valueIdsOf,
  withAxes,
  withSelected,
  withVariants,
  type PriceDrafts,
  type VariantDraft,
  type VariantState,
} from './product-state'

export type VariantErrors = Record<string, { sku?: string; barcodes?: string }>

interface AxesProps {
  state: VariantState
  attributes: AttributeDto[]
  onChange: (state: VariantState) => void
  /** Saved variants pin the axes: changing them would leave those variants without values. */
  locked: boolean
  /** Adds a value typed into an axis that does not have it yet; returns its id. */
  onCreateValue?: (attributeId: string, name: string) => Promise<string | undefined>
  error?: string
}

/**
 * Which values of each axis the model comes in, and below them the matrix of
 * their combinations. Picking a colour or a size ticks all its combinations;
 * the matrix is for unticking the ones that do not exist.
 */
export function VariantAxes({ state, attributes, onChange, locked, onCreateValue, error }: AxesProps) {
  const { t } = useTranslation()
  const byId = useMemo(() => new Map(attributes.map((attribute) => [attribute.id, attribute])), [attributes])
  const ordered = orderedSelection(state, attributes)
  const unused = attributes.filter((attribute) => attribute.isActive && !state.axisIds.includes(attribute.id))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {state.axisIds.map((axisId, position) => {
          const attribute = byId.get(axisId)
          if (!attribute) {
            return null
          }
          const chosen = new Set(state.selected[position])
          const offered = attribute.values.filter((value) => value.isActive || chosen.has(value.id))
          return (
            <div key={axisId} className="grid gap-x-3 gap-y-1 sm:grid-cols-[14rem_1fr] sm:items-start">
              <div data-enter-skip className="flex items-center gap-1">
                {locked ? (
                  <span className="flex h-8.5 items-center text-[13px] font-medium">{attribute.name}</span>
                ) : (
                  <>
                    <Select
                      value={axisId}
                      onChange={(next) =>
                        onChange(
                          withAxes(
                            state,
                            state.axisIds.map((id, index) => (index === position ? next : id)),
                          ),
                        )
                      }
                      options={[attribute, ...unused].map((item) => ({ value: item.id, label: item.name }))}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="iconSm"
                      tabIndex={-1}
                      aria-label={t('products.removeAxis')}
                      onClick={() =>
                        onChange(
                          withAxes(
                            state,
                            state.axisIds.filter((id) => id !== axisId),
                          ),
                        )
                      }
                    >
                      <X />
                    </Button>
                  </>
                )}
              </div>
              <div className="min-w-0">
                <Combobox
                  multiple
                  options={offered.map((value) => ({ value: value.id, label: value.name, color: value.hex }))}
                  value={ordered[position]}
                  onChange={(valueIds) => onChange(withSelected(state, position, valueIds))}
                  placeholder={t('products.pickValues', { name: attribute.name.toLowerCase() })}
                  onCreate={onCreateValue ? (text) => onCreateValue(axisId, text) : undefined}
                />
                <div className="mt-1 flex gap-3 text-xs text-ink-3">
                  <button
                    type="button"
                    tabIndex={-1}
                    className="hover:text-accent-ink"
                    onClick={() =>
                      onChange(
                        withSelected(
                          state,
                          position,
                          offered.map((value) => value.id),
                        ),
                      )
                    }
                  >
                    {t('products.selectAll', { count: offered.length })}
                  </button>
                  {chosen.size ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="hover:text-accent-ink"
                      onClick={() => onChange(withSelected(state, position, []))}
                    >
                      {t('products.clear')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}

        {!locked && state.axisIds.length < MAX_AXES && unused.length ? (
          <div>
            <Menu
              align="start"
              trigger={
                <Button variant="soft" size="sm">
                  <Plus />
                  {t('products.addAxis')}
                </Button>
              }
              items={unused.map((attribute) => ({
                label: attribute.name,
                onSelect: () => onChange(withAxes(state, [...state.axisIds, attribute.id])),
              }))}
            />
            {!state.axisIds.length ? <p className="mt-1.5 text-xs text-ink-3">{t('products.noAxesHint')}</p> : null}
          </div>
        ) : null}
      </div>

      {state.axisIds.length ? (
        <Matrix state={state} attributes={attributes} ordered={ordered} onChange={onChange} />
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function useValues(attributes: AttributeDto[]) {
  return useMemo(
    () => new Map(attributes.flatMap((attribute) => attribute.values.map((value) => [value.id, value] as const))),
    [attributes],
  )
}

interface MatrixProps {
  state: VariantState
  attributes: AttributeDto[]
  ordered: string[][]
  onChange: (state: VariantState) => void
}

/** Rows are the combinations of every axis but the last; columns are the last axis. Arrows move, Space ticks. */
function Matrix({ state, attributes, ordered, onChange }: MatrixProps) {
  const { t } = useTranslation()
  const values = useValues(attributes)
  const tableRef = useRef<HTMLTableElement>(null)
  const [focus, setFocus] = useState({ row: 0, column: 0 })

  if (ordered.some((list) => !list.length)) {
    return (
      <p className="rounded-md border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-3">
        {t('products.matrixEmpty')}
      </p>
    )
  }

  const columns = ordered[ordered.length - 1]
  const rows = combinations(ordered.slice(0, -1))
  const keyAt = (row: number, column: number) => keyOf([...rows[row], columns[column]])
  const isOn = (row: number, column: number) => keyAt(row, column) in state.variants

  const rowKeys = (row: number) => columns.map((_value, column) => keyAt(row, column))
  const columnKeys = (column: number) => rows.map((_values, row) => keyAt(row, column))
  const allKeys = rows.flatMap((_values, row) => rowKeys(row))
  const toggle = (keys: string[]) => onChange(withVariants(state, keys, !keys.every((key) => key in state.variants)))

  const total = allKeys.filter((key) => key in state.variants).length

  const move = (event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) => {
    const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key]
    if (!delta) {
      return
    }
    event.preventDefault()
    const next = {
      row: Math.min(rows.length - 1, Math.max(0, row + delta[0])),
      column: Math.min(columns.length - 1, Math.max(0, column + delta[1])),
    }
    setFocus(next)
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${next.row}:${next.column}"]`)?.focus()
  }

  const name = (valueId: string) => values.get(valueId)?.name ?? '?'
  const headerButton = 'rounded px-1.5 py-0.5 text-xs font-medium text-ink-2 hover:bg-sunken hover:text-ink'

  return (
    <div className="overflow-x-auto">
      <table ref={tableRef} className="border-separate border-spacing-0.5 text-[13px]">
        <thead>
          <tr>
            <th className="text-left">
              <button type="button" tabIndex={-1} className={headerButton} onClick={() => toggle(allKeys)}>
                {t('products.all')}
              </button>
            </th>
            {columns.map((valueId, column) => (
              <th key={valueId} className="min-w-11 text-center">
                <button type="button" tabIndex={-1} className={headerButton} onClick={() => toggle(columnKeys(column))}>
                  <ValueName value={values.get(valueId)} />
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((rowValues, row) => (
            <tr key={keyOf(rowValues)}>
              <th className="pr-2 text-left whitespace-nowrap">
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(headerButton, 'flex items-center gap-1.5')}
                  onClick={() => toggle(rowKeys(row))}
                >
                  {rowValues.length
                    ? rowValues.map((valueId, index) => (
                        <span key={valueId} className="flex items-center gap-1.5">
                          {index ? <span className="text-ink-3">·</span> : null}
                          <ValueName value={values.get(valueId)} />
                        </span>
                      ))
                    : t('products.variants')}
                </button>
              </th>
              {columns.map((valueId, column) => {
                const on = isOn(row, column)
                const draft = state.variants[keyAt(row, column)]
                return (
                  <td key={valueId} className="text-center">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={variantLabel([...rowValues, valueId].map(name))}
                      data-cell={`${row}:${column}`}
                      tabIndex={row === focus.row && column === focus.column ? 0 : -1}
                      onFocus={() => setFocus({ row, column })}
                      onClick={() => toggle([keyAt(row, column)])}
                      onKeyDown={(event) => move(event, row, column)}
                      className={cn(
                        'flex h-8 w-full min-w-11 items-center justify-center rounded-md border transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                        on
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-line bg-surface text-transparent hover:border-control',
                        on && draft && !draft.isActive && 'border-dashed border-line-strong bg-sunken text-ink-3',
                      )}
                    >
                      <Check className="size-4" strokeWidth={2.5} />
                    </button>
                  </td>
                )
              })}
              <td className="tabular pl-2 text-right text-xs text-ink-3">
                {rowKeys(row).filter((key) => key in state.variants).length}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            {columns.map((valueId, column) => (
              <td key={valueId} className="tabular pt-0.5 text-center text-xs text-ink-3">
                {columnKeys(column).filter((key) => key in state.variants).length}
              </td>
            ))}
            <td className="tabular pl-2 text-right text-xs font-semibold text-ink">{total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ValueName({ value }: { value: AttributeValueDto | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {value?.hex ? <ColorDot color={value.hex} /> : null}
      {value?.name ?? '?'}
    </span>
  )
}

interface DetailsProps {
  state: VariantState
  attributes: AttributeDto[]
  /** Changes one variant; must keep its identity between renders so untouched rows do not redraw. */
  onPatch: (key: string, patch: Partial<VariantDraft>) => void
  priceTypes: PriceTypeDto[]
  /** The model's own prices, shown where a variant has none of its own. */
  modelPrices: PriceDrafts
  canPrice: boolean
  /** What a price may be in: the base and the currencies the business has. */
  priceCurrencies: CurrencyCode[]
  errors: VariantErrors
}

const parseBarcode = (text: string) => {
  const result = barcodeSchema.safeParse(text)
  return result.success ? result.data : null
}

/** One line per variant: its article, its barcodes, and prices where they differ from the model's. */
export function VariantDetails({
  state,
  attributes,
  onPatch,
  priceTypes,
  modelPrices,
  canPrice,
  priceCurrencies,
  errors,
}: DetailsProps) {
  const { t } = useTranslation()
  const values = useValues(attributes)
  const keys = orderedKeys(state, attributes)
  const header =
    'px-1.5 pb-1.5 text-left text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase whitespace-nowrap'

  if (!keys.length) {
    return null
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={header}>{t('products.variant')}</th>
            <th className={header}>{t('products.sku')}</th>
            <th className={header}>{t('products.barcodes')}</th>
            {canPrice
              ? priceTypes.map((type) => (
                  <th key={type.id} className={cn(header, 'text-right')}>
                    {type.name}
                  </th>
                ))
              : null}
            <th className={header}>{t('common.active')}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <VariantRow
              key={key}
              variantKey={key}
              draft={state.variants[key]}
              values={values}
              onPatch={onPatch}
              priceTypes={priceTypes}
              modelPrices={modelPrices}
              canPrice={canPrice}
              priceCurrencies={priceCurrencies}
              error={errors[key]}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface RowProps extends Pick<
  DetailsProps,
  'onPatch' | 'priceTypes' | 'modelPrices' | 'canPrice' | 'priceCurrencies'
> {
  variantKey: string
  draft: VariantDraft
  values: Map<string, AttributeValueDto>
  error: VariantErrors[string] | undefined
}

/** Memoised: a model can have hundreds of variants, and typing in one row should redraw one row. */
const VariantRow = memo(function VariantRow({
  variantKey,
  draft,
  values,
  onPatch,
  priceTypes,
  modelPrices,
  canPrice,
  priceCurrencies,
  error,
}: RowProps) {
  const { t } = useTranslation()
  const valueIds = valueIdsOf(variantKey)

  return (
    <tr className={cn('align-top', !draft.isActive && 'opacity-60')}>
      <td className="py-1 pr-3 pl-1.5 text-[13px] whitespace-nowrap">
        <span className="flex h-8.5 items-center gap-1.5">
          {valueIds.length
            ? valueIds.map((valueId, index) => (
                <span key={valueId} className="flex items-center gap-1.5">
                  {index ? <span className="text-ink-3">·</span> : null}
                  <ValueName value={values.get(valueId)} />
                </span>
              ))
            : t('products.singleVariant')}
        </span>
      </td>
      <td className="w-40 p-1">
        <Input
          value={draft.sku}
          onChange={(event) => onPatch(variantKey, { sku: event.target.value })}
          placeholder={t('products.automatic')}
          maxLength={40}
          invalid={!!error?.sku}
          aria-label={t('products.sku')}
          className="font-code text-xs"
        />
        {error?.sku ? <p className="mt-0.5 text-xs text-bad">{error.sku}</p> : null}
      </td>
      <td className="min-w-56 p-1">
        <TagInput
          value={draft.barcodes}
          onChange={(barcodes) => onPatch(variantKey, { barcodes })}
          parse={parseBarcode}
          max={MAX_BARCODES}
          placeholder={draft.id ? undefined : t('products.automatic')}
          invalid={!!error?.barcodes}
        />
        {error?.barcodes ? <p className="mt-0.5 text-xs text-bad">{error.barcodes}</p> : null}
      </td>
      {canPrice
        ? priceTypes.map((type) => {
            const own = draft.prices[type.id]
            const inherited = modelPrices[type.id]
            const currency: CurrencyCode = own?.currency ?? inherited?.currency ?? type.currency
            const setPrice = (amount: number | null, nextCurrency: CurrencyCode) =>
              onPatch(variantKey, { prices: { ...draft.prices, [type.id]: { amount, currency: nextCurrency } } })
            return (
              <td key={type.id} className="w-36 p-1">
                <MoneyInput
                  value={own?.amount ?? null}
                  onChange={(amount) => setPrice(amount, currency)}
                  currency={currency}
                  currencies={priceCurrencies}
                  onCurrencyChange={
                    priceCurrencies.length > 1 ? (next) => setPrice(own?.amount ?? null, next) : undefined
                  }
                  placeholder={inherited?.amount != null ? t('products.asModel') : '0'}
                />
              </td>
            )
          })
        : null}
      <td className="p-1">
        <span className="flex h-8.5 items-center">
          <Switch checked={draft.isActive} onChange={(isActive) => onPatch(variantKey, { isActive })} />
        </span>
      </td>
    </tr>
  )
})
