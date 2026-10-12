import { formulaText, pricingSays, type PriceTypeDto, type ReceiptPricing } from '@erp/core'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox, Segments } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import {
  FormulaFields,
  formulaOf,
  formulaRowOf,
  type FormulaRow,
  type FormulaWay,
} from '@/features/pricing/formula-fields'
import { cn } from '@/lib/cn'

/** What posting would do with one price type, counted in models: for the window to say before it is done. */
export interface PricingCount {
  /** Models with no price of the type that are given one. */
  fresh: number
  /** Models whose price is replaced. */
  replaced: number
  /** Models whose price stands. */
  kept: number
}

const SILENT: ReceiptPricing = { skip: false, formula: null, all: false }

/** How a price type is priced on this receipt, in a few words: for its chip. */
export function pricingText(type: PriceTypeDto, said: ReceiptPricing | undefined, t: TFunction): string {
  if (said?.skip) {
    return t('receipts.pricingSkips')
  }
  const how = said?.formula
    ? `${formulaText(said.formula, type.currency)} · ${t('receipts.pricingHere')}`
    : type.kind === 'min'
      ? // The floor is not set by a receipt: the till works it out, or it is kept by hand.
        t(type.formula ? 'receipts.pricingAtTill' : 'receipts.pricingByHand')
      : type.formula
        ? formulaText(type.formula, type.currency)
        : t('pricing.byRules')
  return said?.all ? `${how} · ${t('receipts.pricingAll')}` : how
}

interface PricingBarProps {
  /** The retail type first. */
  types: PriceTypeDto[]
  retailId: string | undefined
  pricing: Record<string, ReceiptPricing>
  onChange: (pricing: Record<string, ReceiptPricing>) => void
  editable: boolean
  counts: Record<string, PricingCount>
}

/**
 * How this receipt prices its goods, a chip to a price type. Left alone, each follows the rules; a chip opens a
 * window where this one shipment is given a formula of its own, is not priced at all, or has its formula reach
 * the goods that already have a price. The rules themselves are not changed by it.
 */
export function PricingBar({ types, retailId, pricing, onChange, editable, counts }: PricingBarProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<string | null>(null)
  const type = types.find((item) => item.id === open)

  const say = (typeId: string, said: ReceiptPricing) => {
    const next = { ...pricing }
    if (pricingSays(said)) {
      next[typeId] = said
    } else {
      delete next[typeId]
    }
    onChange(next)
  }

  return (
    <div data-pricing-bar className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 text-ink-3">{t('receipts.pricing')}</span>
      {types.map((item) => {
        const said = pricing[item.id]
        return (
          <button
            key={item.id}
            type="button"
            data-enter-skip
            tabIndex={-1}
            disabled={!editable}
            onClick={() => setOpen(item.id)}
            className={cn(
              'rounded-md border px-2 py-1 text-left transition-colors',
              pricingSays(said)
                ? 'border-accent/40 bg-accent-soft text-accent-ink'
                : 'border-line bg-surface text-ink-2',
              editable && 'hover:border-control',
            )}
          >
            <span className="font-medium text-ink">{item.name}:</span> {pricingText(item, said, t)}
          </button>
        )
      })}
      {type ? (
        <PricingDialog
          type={type}
          ownRetail={type.id === retailId}
          said={pricing[type.id] ?? SILENT}
          onChange={(said) => say(type.id, said)}
          count={counts[type.id]}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  )
}

type Way = 'rules' | 'own' | 'skip'

interface PricingDialogProps {
  type: PriceTypeDto
  ownRetail: boolean
  said: ReceiptPricing
  onChange: (said: ReceiptPricing) => void
  count: PricingCount | undefined
  onClose: () => void
}

/** One price type on this receipt. What is chosen takes hold at once: the blocks behind show it as it is chosen. */
function PricingDialog({ type, ownRetail, said, onChange, count, onClose }: PricingDialogProps) {
  const { t } = useTranslation()
  // The formula as it is being entered: it is the receipt's once it is whole.
  const [row, setRow] = useState<FormulaRow>(() =>
    said.formula ? formulaRowOf(said.formula) : { way: 'cost', percent: null, amount: null },
  )
  const [way, setWay] = useState<Way>(said.skip ? 'skip' : said.formula ? 'own' : 'rules')

  const choose = (next: Way) => {
    setWay(next)
    onChange({
      skip: next === 'skip',
      formula: next === 'own' ? formulaOf(row) : null,
      all: next === 'skip' ? false : said.all,
    })
  }
  const enter = (next: FormulaRow) => {
    setRow(next)
    onChange({ ...said, skip: false, formula: formulaOf(next) })
  }
  const ways: FormulaWay[] = ownRetail ? ['cost', 'fixed'] : ['cost', 'retail_less', 'retail_more', 'fixed']

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('receipts.pricingFor', { type: type.name })}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('receipts.pricingDone')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-pricing-dialog>
        <Segments
          value={way}
          onChange={choose}
          options={[
            { value: 'rules', label: t('pricing.byRules') },
            { value: 'own', label: t('receipts.pricingOwn') },
            { value: 'skip', label: t('receipts.pricingSkip') },
          ]}
        />
        {way === 'own' ? (
          <Field label={t('receipts.pricingFormula')}>
            {() => (
              <FormulaFields
                value={row}
                onChange={enter}
                currency={type.currency}
                noneLabel={t('pricing.byRules')}
                ways={ways}
                autoFocus
              />
            )}
          </Field>
        ) : (
          <p className="text-[13px] text-ink-2">
            {way === 'skip'
              ? t('receipts.pricingSkipNote', { type: type.name })
              : type.kind === 'min'
                ? t('receipts.pricingFloorNote')
                : t('receipts.pricingRulesNote', {
                    how: type.formula ? formulaText(type.formula, type.currency) : t('receipts.pricingNoOwn'),
                  })}
          </p>
        )}
        {way === 'skip' ? null : (
          <Checkbox
            checked={said.all}
            onChange={(all) => onChange({ ...said, all })}
            label={t('receipts.pricingAllLabel')}
            hint={t('receipts.pricingAllHint')}
          />
        )}
        {count ? (
          <p data-pricing-count className="rounded-md bg-sunken px-3 py-2 text-[13px] text-ink-2">
            {[
              t('receipts.pricingFresh', { count: count.fresh }),
              count.replaced ? t('receipts.pricingReplaced', { count: count.replaced }) : '',
              count.kept ? t('receipts.pricingKept', { count: count.kept }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
