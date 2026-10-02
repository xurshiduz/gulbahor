import {
  formatMoney,
  settle,
  settleRefund,
  toBase,
  type CurrencyCode,
  type PosContextDto,
  type PosItemDto,
  type ReturnDto,
  type SaleDto,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Lock, Receipt, ScanLine, Search, Store, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { EmptyState, Shortcut, Spinner } from '@/components/ui/feedback'
import { controlClass, Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { useRegisters } from '@/features/money/money-page'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { useScanner } from '@/lib/scanner'

import {
  addToCart,
  backLines,
  badDiscount,
  cartTotals,
  changeText,
  EMPTY_CART,
  refundRows,
  splitMultiplier,
  suggestRefunds,
  tenderRows,
  uuid,
  type Cart,
  type Returning,
  type TenderRow,
} from './pos-state'
import { ReturnDialog, ReturnPicker } from './return-parts'
import { SaleDialog } from './sale-dialog'
import { CloseShiftDialog, OpenShift } from './shift-parts'

const route = getRouteApi('/pos')

const REGISTER_KEY = 'gb.pos.register'
const cartKey = (registerId: string) => `gb.pos.cart.${registerId}`

const money = (minor: number, currency: CurrencyCode = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

/** The four ways money changes hands at a till; each has its key. */
type TenderKind = 'cash' | 'usd' | 'card' | 'terminal'
const kindOf = (row: TenderRow): TenderKind =>
  row.method === 'cash' ? (row.currency === 'USD' ? 'usd' : 'cash') : row.method
const KIND_LABELS: Record<TenderKind, string> = {
  cash: 'pos.payCash',
  usd: 'pos.payUsd',
  card: 'pos.payCard',
  terminal: 'pos.payTerminal',
}
const KIND_KEYS: Record<TenderKind, string> = { cash: 'f5', usd: 'f6', card: 'f7', terminal: 'f8' }

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // The cart still works for this visit.
  }
}

/**
 * The till. It finds its register (the one this computer used last), then
 * shows whichever comes next: a shift to open, or the sale screen.
 */
export function PosPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const registers = useRegisters()
  const active = useMemo(() => (registers.data ?? []).filter((register) => register.isActive), [registers.data])
  const [registerId, setRegisterId] = useState<string | null>(() => stored<string | null>(REGISTER_KEY, null))
  const register = active.find((item) => item.id === registerId) ?? (active.length === 1 ? active[0] : null)

  const choose = (id: string) => {
    setRegisterId(id)
    store(REGISTER_KEY, id)
  }

  const context = useQuery({
    queryKey: ['pos', 'context', register?.id],
    queryFn: ({ signal }) => api.get<PosContextDto>(`/pos/context/${register?.id}`, undefined, signal),
    enabled: !!register,
    placeholderData: keepPreviousData,
  })

  if (registers.isPending || (register && !context.data)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!active.length) {
    return (
      <Page title={t('pos.title')}>
        <EmptyState
          icon={Store}
          title={t('pos.noRegisters')}
          hint={t('pos.noRegistersHint')}
          action={
            can('money.manage') ? (
              <Link to="/money" className="text-[13px] font-medium text-accent underline">
                {t('pos.setUp')}
              </Link>
            ) : null
          }
        />
      </Page>
    )
  }

  if (!register || !context.data) {
    return (
      <Page title={t('pos.title')} note={t('pos.chooseRegister')}>
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          {active.map((item, index) => (
            <button
              key={item.id}
              type="button"
              autoFocus={index === 0}
              onClick={() => choose(item.id)}
              className="rounded-lg border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-ink-3">{item.locationName}</p>
              <p className="mt-2 text-xs text-ink-2">
                {item.shift ? `${item.shift.number} · ${item.shift.openedByName ?? ''}` : t('money.noShift')}
              </p>
            </button>
          ))}
        </div>
      </Page>
    )
  }

  return context.data.shift ? (
    <Till
      key={context.data.shift.id}
      context={context.data}
      registers={active.length}
      onSwitch={() => setRegisterId(null)}
    />
  ) : (
    <Page
      title={t('pos.title')}
      note={`${register.name} · ${register.locationName}`}
      actions={
        active.length > 1 ? <Button onClick={() => setRegisterId(null)}>{t('pos.switchRegister')}</Button> : null
      }
    >
      <OpenShift context={context.data} />
    </Page>
  )
}

interface TillProps {
  context: PosContextDto
  registers: number
  onSwitch: () => void
}

/** The document the till made last, to look at or print again. */
interface LastDocument {
  kind: 'sale' | 'return'
  id: string
  number: string
}

/**
 * The sale screen. One field takes everything: a scanned barcode or tag, an
 * article, a name, and "3*" before any of them for three. Every way of
 * paying has its field; what is still due, or the change, is always on the
 * screen.
 *
 * Goods brought back are picked from their receipt and then sit above the
 * cart. With nothing in the cart that is a return and the fields hand money
 * back; with goods in it, it is an exchange and only the difference is paid,
 * or handed back.
 */
function Till({ context, registers, onSwitch }: TillProps) {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const registerId = context.register.id
  const searchRef = useRef<HTMLInputElement>(null)
  // One sale, one key: sent twice, it is still made once.
  const clientKey = useRef(uuid())

  // A cart half rung up survives a reload: it is kept on this computer until it is sold or cleared.
  const [cart, setCart] = useState<Cart>(() => stored<Cart>(cartKey(registerId), EMPTY_CART))
  useEffect(() => store(cartKey(registerId), cart), [cart, registerId])
  const [returning, setReturning] = useState<Returning | null>(null)
  /** The receipt picker: open, and with which code to look up at once. */
  const [picking, setPicking] = useState<{ code?: string } | null>(null)
  // Every way of paying has its field, always there; what is kept is only what was typed into them.
  const [paid, setPaid] = useState<Record<string, Partial<TenderRow>>>({})
  const [changeCurrency, setChangeCurrency] = useState<CurrencyCode>('UZS')
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [closing, setClosing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [last, setLast] = useState<LastDocument | null>(null)
  const [viewing, setViewing] = useState<LastDocument | null>(null)

  const rate = context.rate?.uzsPerUsd ?? null
  const mayReturn = can('pos.return')
  const { qty: multiplier, rest } = splitMultiplier(text)

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(rest), 180)
    return () => window.clearTimeout(timer)
  }, [rest])
  useEffect(() => setHighlight(0), [query])

  // "Bring this receipt back" from the list of receipts lands here with its number.
  useEffect(() => {
    if (search.return && mayReturn) {
      setPicking({ code: search.return })
      void navigate({ search: {}, replace: true })
    }
  }, [search.return, mayReturn, navigate])

  const found = useQuery({
    queryKey: ['pos', 'search', registerId, query],
    queryFn: ({ signal }) => api.get<PosItemDto[]>('/pos/search', { registerId, q: query }, signal),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
  })
  const results = query.length >= 2 && rest === query ? (found.data ?? []) : []

  const focusSearch = () => searchRef.current?.focus()

  const add = (item: PosItemDto, qty = 1) => {
    if (item.price === null) {
      toast.error(t('pos.noPrice', { name: item.name }))
      return
    }
    const next = addToCart(cart, item, qty)
    if (!next.added) {
      toast.info(t('pos.alreadyInCart'))
      return
    }
    setCart(next.cart)
    setText('')
    focusSearch()
  }

  const lookup = (code: string, qty: number) => {
    api
      .get<PosItemDto>('/pos/lookup', { registerId, code })
      .then((item) => add(item, qty))
      .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error)))
  }

  /** Asks for the cart's things again: a price or a count may have changed since they were put there. */
  const refresh = useMutation({
    mutationFn: (variantIds: string[]) => api.post<PosItemDto[]>('/pos/items', { registerId, variantIds }),
    meta: { silent: true },
    onSuccess: (items) => {
      const fresh = new Map(items.map((item) => [item.variantId, item]))
      setCart((current) => ({
        ...current,
        lines: current.lines.map((line) => {
          const item = fresh.get(line.item.variantId)
          return item ? { ...line, item: { ...item, epc: line.item.epc } } : line
        }),
      }))
    },
  })
  const refreshCart = () =>
    cart.lines.length ? refresh.mutate(cart.lines.map((line) => line.item.variantId)) : undefined

  const idle = !closing && !viewing && !picking
  // A scan lands in the cart wherever the cursor is; a count typed before it applies to it.
  useScanner((code) => lookup(code, multiplier ?? 1), { enabled: idle })

  const handleSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((current) => (results.length ? (current + delta + results.length) % results.length : 0))
    } else if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (results[highlight]) {
        add(results[highlight], multiplier ?? 1)
      } else if (rest) {
        // Typed in full and nothing listed yet: take it as a code.
        lookup(rest, multiplier ?? 1)
      } else if (cart.lines.length || returning) {
        // Nothing more to add: on to the money.
        focusTender('cash')
      }
    } else if (event.key === 'Escape' && text) {
      event.preventDefault()
      event.stopPropagation()
      setText('')
    }
  }

  // ── The sum ──
  const totals = useMemo(() => cartTotals(cart), [cart])
  const percent = totals.subtotal ? (totals.discount * 100) / totals.subtotal : 0
  const overLimit = percent > context.maxDiscountPercent && !context.mayOverDiscount
  const back = useMemo(() => backLines(returning), [returning])
  /** What the goods brought back are worth: it pays for the new ones first. */
  const credit = back.reduce((sum, item) => sum + item.total, 0)
  /** More came back than is being taken: the till owes the customer. */
  const refunding = !!returning && credit > totals.total
  const toPay = refunding ? 0 : totals.total - credit
  const toRefund = refunding ? credit - totals.total : 0

  // ── The money: paid in, or handed back ──
  const rows = useMemo(
    () => (refunding && returning ? refundRows(context, returning.found) : tenderRows(context)),
    [context, refunding, returning],
  )
  const tenders = useMemo(() => rows.map((row) => ({ ...row, ...paid[row.key] })), [rows, paid])
  // What was typed for paying means nothing for handing back, and the other way round.
  useEffect(() => setPaid({}), [refunding])
  const entered = tenders.filter((row) => row.amount)
  const typed = entered.map((row) => ({ method: row.method, currency: row.currency, amount: row.amount as number }))
  const settlement = settle(toPay, refunding ? [] : typed, {
    uzsPerUsd: rate,
    changeCurrency,
    roundStep: context.changeRoundStep,
  })
  const refund = settleRefund(toRefund, refunding ? typed : [], {
    uzsPerUsd: rate,
    roundStep: context.changeRoundStep,
  })
  /** What is taken as meant when the cashier types nothing: so'm cash for a sale, the way it was paid for a return. */
  const suggested = useMemo<Record<string, number>>(
    () =>
      refunding && returning
        ? suggestRefunds(toRefund, returning.found, context.changeRoundStep)
        : toPay
          ? { cash: toPay }
          : {},
    [refunding, returning, toRefund, toPay, context.changeRoundStep],
  )

  /** What a row would have to hold to cover the rest: what "=" fills in. */
  const fillOf = (row: TenderRow): number => {
    const others = entered
      .filter((item) => item.key !== row.key)
      .reduce((sum, item) => sum + toBase(item.amount as number, item.currency, rate), 0)
    const due = Math.max(0, (refunding ? toRefund : toPay) - others)
    return row.currency === 'USD' && rate ? Math.ceil((due * 100) / Math.round(rate * 100)) : due
  }

  /** F5…F8: the cursor goes to that way of paying. */
  const focusTender = (kind: TenderKind) => {
    const row = tenders.find((item) => kindOf(item) === kind)
    if (!row) {
      if (kind === 'card' || kind === 'terminal') {
        toast.error(refunding ? t('pos.notPaidThatWay') : kind === 'card' ? t('pos.noCards') : t('pos.noTerminals'))
      }
      return
    }
    if (kind === 'usd' && !rate) {
      toast.error(t('pos.noRate'))
      return
    }
    const field = document.querySelector<HTMLInputElement>(`[data-tender="${row.key}"] input`)
    field?.focus()
    field?.select()
  }
  const patchTender = (key: string, patch: Partial<TenderRow>) =>
    setPaid((current) => ({ ...current, [key]: { ...current[key], ...patch } }))

  /** Enter or ↓ in a payment field goes on to the next one, ↑ back to the one before. */
  const nextTender = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'Enter' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!step || event.ctrlKey || event.metaKey || event.altKey || !(event.target instanceof HTMLInputElement)) {
      return
    }
    const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input:not(:disabled)')]
    const next = fields[fields.indexOf(event.target) + step]
    if (next) {
      event.preventDefault()
      next.focus()
      next.select()
    }
  }

  // ── Done ──
  const reset = () => {
    clientKey.current = uuid()
    setCart(EMPTY_CART)
    setPaid({})
    setReturning(null)
    for (const key of ['pos', 'sales', 'returns', 'stock']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
    focusSearch()
  }
  const refuse = (error: unknown) => {
    const refused = error instanceof ApiError
    toast.error(refused ? (Object.values(error.fields ?? {})[0] ?? error.message) : String(error))
    // Refused for a price or a count that changed: show the cart as it now stands.
    if (refused && error.status !== 0) {
      refreshCart()
    }
  }

  const sell = useMutation({
    mutationFn: (body: unknown) => api.post<SaleDto>('/sales', body),
    meta: { silent: true },
    onSuccess: (sale) => {
      reset()
      setLast({ kind: 'sale', id: sale.id, number: sale.number })
      toast.success(
        sale.changeUzs || sale.changeUsd
          ? t('pos.soldWithChange', { number: sale.number, change: changeText(sale.changeUzs, sale.changeUsd) })
          : t('pos.sold', { number: sale.number }),
      )
    },
    onError: refuse,
  })

  const giveBack = useMutation({
    mutationFn: (input: { body: unknown; change: string }) => api.post<ReturnDto>('/returns', input.body),
    meta: { silent: true },
    onSuccess: (made, input) => {
      reset()
      setLast({ kind: 'return', id: made.id, number: made.number })
      const handed = made.refunds.reduce((sum, item) => sum + item.base, 0)
      toast.success(
        [
          made.exchangeSaleNumber
            ? t('pos.exchanged', { number: made.number, sale: made.exchangeSaleNumber })
            : t('pos.returned', { number: made.number }),
          handed ? t('pos.handedBack', { amount: money(handed) }) : null,
          input.change ? `${t('pos.change')}: ${input.change}` : null,
        ]
          .filter(Boolean)
          .join('. '),
      )
    },
    onError: refuse,
  })
  const busy = sell.isPending || giveBack.isPending

  const complete = () => {
    if (busy || (!cart.lines.length && !returning)) {
      return
    }
    if (cart.lines.some((line) => badDiscount(line.discountText)) || badDiscount(cart.discountText)) {
      toast.error(t('pos.badDiscount'))
      return
    }
    if (overLimit) {
      toast.error(t('pos.overLimit', { percent: context.maxDiscountPercent }))
      return
    }
    if (entered.length && refunding && (refund.problem || refund.due > 0)) {
      toast.error(refund.problem === 'over' ? t('pos.refundOver') : t('pos.refundDue', { amount: money(refund.due) }))
      return
    }
    if (entered.length && !refunding && (settlement.problem || settlement.due > 0)) {
      toast.error(
        settlement.problem === 'non_cash_over'
          ? t('pos.nonCashOver')
          : t('pos.stillDue', { amount: money(settlement.due) }),
      )
      return
    }
    // Nothing typed into the fields: what is suggested there is what is meant.
    const amounts = entered.length
      ? entered.map((row) => ({
          method: row.method,
          accountId: row.accountId,
          currency: row.currency,
          amount: row.amount,
          reference: row.reference || null,
        }))
      : tenders.flatMap((row) =>
          suggested[row.key]
            ? [{ method: row.method, accountId: row.accountId, currency: row.currency, amount: suggested[row.key] }]
            : [],
        )
    const goods = {
      sellerId: cart.sellerId,
      lines: cart.lines.map((line, index) => ({
        variantId: line.item.variantId,
        qty: line.qty,
        discount: totals.lineDiscounts[index],
        epc: line.item.epc,
      })),
      discount: totals.saleDiscount,
      changeCurrency,
      total: totals.total,
    }
    if (!returning) {
      sell.mutate({ clientKey: clientKey.current, registerId, ...goods, payments: amounts })
      return
    }
    giveBack.mutate({
      body: {
        clientKey: clientKey.current,
        registerId,
        saleId: returning.found.sale.id,
        lines: back.map((item) => ({ saleLineId: item.line.id, qty: item.qty })),
        reason: returning.reason || null,
        total: credit,
        refunds: refunding ? amounts : [],
        exchange: cart.lines.length ? { ...goods, payments: refunding ? [] : amounts } : null,
      },
      change:
        !refunding && (settlement.changeUzs || settlement.changeUsd)
          ? changeText(settlement.changeUzs, settlement.changeUsd)
          : '',
    })
  }

  const group = t('pos.title')
  useHotkey('f2', focusSearch, { label: t('pos.search'), group, enabled: idle })
  useHotkey('f4', () => setPicking({}), { label: t('pos.returnTitle'), group, enabled: idle && mayReturn })
  useHotkey('f5', () => focusTender('cash'), { label: t('pos.payCash'), group, enabled: idle })
  useHotkey('f6', () => focusTender('usd'), { label: t('pos.payUsd'), group, enabled: idle && context.usd })
  useHotkey('f7', () => focusTender('card'), { label: t('pos.payCard'), group, enabled: idle })
  useHotkey('f8', () => focusTender('terminal'), { label: t('pos.payTerminal'), group, enabled: idle })
  useHotkey('f9', complete, { label: t('pos.complete'), group, enabled: idle })
  useHotkey('mod+enter', complete, { enabled: idle })

  useEffect(() => {
    focusSearch()
    refreshCart()
    // Once, when the till opens: a cart kept from before may hold yesterday's prices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Page
      title={t('pos.title')}
      note={[
        context.register.name,
        context.register.locationName,
        context.shift?.number,
        rate ? `1 $ = ${money(Math.round(rate * 100))}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_22rem]">
        {/* ── The cart ── */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <input
                ref={searchRef}
                value={text}
                autoComplete="off"
                spellCheck={false}
                placeholder={t('pos.searchPlaceholder')}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={handleSearchKey}
                onFocus={() => setSearching(true)}
                onBlur={() => setSearching(false)}
                className={cn(controlClass, 'h-11 pl-9 text-sm')}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2 text-xs text-ink-3">
                {multiplier ? <span className="tabular font-semibold text-accent">× {multiplier}</span> : null}
                <Shortcut combo="f2" />
              </span>
              {searching && results.length ? (
                <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-float">
                  {results.map((item, index) => (
                    <button
                      key={item.variantId}
                      type="button"
                      tabIndex={-1}
                      data-highlighted={index === highlight}
                      onMouseMove={() => setHighlight(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => add(item, multiplier ?? 1)}
                      className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1 text-left text-[13px] data-[highlighted=true]:bg-sunken"
                    >
                      <span className="font-code w-20 shrink-0 truncate text-xs text-ink-3">{item.sku}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{item.name}</span>
                        {item.label ? <span className="text-ink-2"> · {item.label}</span> : null}
                      </span>
                      <span className={cn('tabular shrink-0 text-xs', item.onHand > 0 ? 'text-ink-3' : 'text-bad')}>
                        {formatNumber(item.onHand)}
                      </span>
                      <span className="tabular w-24 shrink-0 text-right font-medium">
                        {item.price === null ? '—' : money(item.price)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {mayReturn ? (
              <Button className="h-11" onClick={() => setPicking({})}>
                <Undo2 />
                {t('pos.returnTitle')}
                <Shortcut combo="f4" className="ml-0.5" />
              </Button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface shadow-card">
            {returning ? (
              <div className="border-b border-line bg-warn-soft px-3 py-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <Undo2 className="size-4 shrink-0 text-warn" />
                  <span className="font-medium">
                    {t('pos.returning')} · {returning.found.sale.number}
                  </span>
                  <span className="tabular min-w-0 flex-1 truncate text-xs text-ink-3">
                    {formatDateTime(returning.found.sale.soldAt)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setPicking({})}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t('common.cancel')}
                    onClick={() => setReturning(null)}
                  >
                    <X />
                  </Button>
                </div>
                {back.map((item) => (
                  <div key={item.line.id} className="flex items-baseline justify-between gap-3 py-0.5 pl-6">
                    <span className="min-w-0 truncate">
                      {item.line.productName}
                      {item.line.label ? <span className="text-ink-2"> · {item.line.label}</span> : null}
                      <span className="tabular text-xs text-ink-3"> × {formatNumber(item.qty)}</span>
                    </span>
                    <span className="tabular shrink-0 font-medium">−{money(item.total)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {cart.lines.length ? (
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-sunken text-left text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
                  <tr>
                    <th className="px-3 py-2">{t('products.name')}</th>
                    <th className="w-24 px-2 py-2 text-right">{t('receipts.totalQty')}</th>
                    <th className="w-28 px-2 py-2 text-right">{t('pos.price')}</th>
                    <th className="w-28 px-2 py-2">{t('pos.discount')}</th>
                    <th className="w-32 px-3 py-2 text-right">{t('pos.total')}</th>
                    <th className="w-px" />
                  </tr>
                </thead>
                <tbody>
                  {cart.lines.map((line, index) => {
                    const patch = (change: Partial<typeof line>) =>
                      setCart({
                        ...cart,
                        lines: cart.lines.map((item) => (item.key === line.key ? { ...item, ...change } : item)),
                      })
                    const short = !line.item.epc && line.qty > line.item.onHand
                    return (
                      <tr key={line.key} className="border-t border-line align-top first:border-t-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">
                            {line.item.name}
                            {line.item.label ? (
                              <span className="font-normal text-ink-2"> · {line.item.label}</span>
                            ) : null}
                          </p>
                          <p className="flex items-center gap-2 text-xs text-ink-3">
                            <span className="font-code">{line.item.sku}</span>
                            {line.item.epc ? (
                              <span className="inline-flex items-center gap-1">
                                <ScanLine className="size-3" />#{line.item.epc.slice(-6)}
                              </span>
                            ) : null}
                            {short ? (
                              <span className="text-bad">
                                {t('pos.onHand', { qty: formatNumber(line.item.onHand) })}
                              </span>
                            ) : null}
                          </p>
                        </td>
                        <td className="px-2 py-1.5">
                          <NumberInput
                            value={line.qty}
                            onChange={(qty) => (qty ? patch({ qty }) : undefined)}
                            decimals={line.item.decimals}
                            min={line.item.decimals ? 0.001 : 1}
                            // A tagged piece is that one piece.
                            disabled={!!line.item.epc}
                            invalid={short}
                            className="[&_input]:text-right"
                          />
                        </td>
                        <td className="tabular px-2 py-2.5 text-right">{money(line.item.price ?? 0)}</td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={line.discountText}
                            placeholder="10% / 5000"
                            invalid={badDiscount(line.discountText)}
                            onChange={(event) => patch({ discountText: event.target.value })}
                          />
                        </td>
                        <td className="tabular px-3 py-2.5 text-right font-semibold">
                          {money(totals.lines[index]?.gross - totals.lineDiscounts[index])}
                        </td>
                        <td className="py-1.5 pr-2">
                          <Button
                            variant="ghost"
                            size="iconSm"
                            tabIndex={-1}
                            aria-label={t('common.delete')}
                            onClick={() =>
                              setCart({ ...cart, lines: cart.lines.filter((item) => item.key !== line.key) })
                            }
                          >
                            <X />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState
                icon={ScanLine}
                title={returning ? t('pos.exchangeOrNot') : t('pos.emptyCart')}
                hint={returning ? undefined : t('pos.emptyCartHint')}
              />
            )}
          </div>
        </div>

        {/* ── The sum and the money ── */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {/* As tall as the search field beside it, so the cart and the sum start on one line. */}
          <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-end gap-2">
            {last ? (
              <Button onClick={() => setViewing(last)}>
                {last.kind === 'sale' ? <Receipt /> : <Undo2 />}
                {last.number}
              </Button>
            ) : null}
            {registers > 1 ? <Button onClick={onSwitch}>{t('pos.switchRegister')}</Button> : null}
            <Button onClick={() => setClosing(true)}>
              <Lock />
              {t('pos.closeShiftAction')}
            </Button>
          </div>
          <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <div className="flex items-baseline justify-between text-[13px] text-ink-3">
              <span>{t('pos.subtotal')}</span>
              <span className="tabular">{money(totals.subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-ink-3">
              <span>{t('pos.saleDiscount')}</span>
              <Input
                value={cart.discountText}
                placeholder="10% / 5000"
                invalid={badDiscount(cart.discountText) || overLimit}
                onChange={(event) => setCart({ ...cart, discountText: event.target.value })}
                className="w-32 text-right"
              />
            </div>
            {totals.discount ? (
              <div
                className={cn(
                  'mt-2 flex items-baseline justify-between text-[13px]',
                  overLimit ? 'text-bad' : 'text-ink-3',
                )}
              >
                <span>
                  {t('pos.discount')} ({percent.toFixed(1).replace('.', ',')}%)
                </span>
                <span className="tabular">−{money(totals.discount)}</span>
              </div>
            ) : null}
            {overLimit ? (
              <p className="mt-1 text-xs text-bad">{t('pos.overLimit', { percent: context.maxDiscountPercent })}</p>
            ) : null}
            {returning ? (
              <div className="mt-2 flex items-baseline justify-between text-[13px] text-warn">
                <span>{t('pos.returnedGoods')}</span>
                <span className="tabular">−{money(credit)}</span>
              </div>
            ) : null}
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm font-medium">{refunding ? t('pos.toRefund') : t('pos.total')}</span>
              <span className={cn('tabular text-2xl font-semibold', refunding && 'text-warn')}>
                {money(refunding ? toRefund : toPay)}
              </span>
            </div>
            {rate && (toPay || toRefund) ? (
              <p className="tabular text-right text-xs text-ink-3">
                ≈ {money(Math.ceil(((toPay || toRefund) * 100) / Math.round(rate * 100)), 'USD')}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
            <div className="flex flex-col gap-2" onKeyDown={nextTender}>
              {tenders.map((row) => {
                const kind = kindOf(row)
                const cap = returning?.found.caps.accounts.find((item) => item.accountId === row.accountId)
                // Paying, a card is one of the shop's; handing back, it is the one the receipt was paid with.
                const accounts = refunding
                  ? []
                  : kind === 'card'
                    ? context.cards
                    : kind === 'terminal'
                      ? context.terminals
                      : []
                const account = refunding ? cap : accounts.length === 1 ? accounts[0] : null
                const noRate = row.currency === 'USD' && !rate
                // How much may go back this way, for someone who must hand it back the way it was paid.
                const limit =
                  refunding && returning && !returning.found.free
                    ? row.method === 'cash'
                      ? returning.found.caps.cash
                      : (cap?.left ?? 0)
                    : null
                return (
                  <div key={row.key} data-tender={row.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-ink-2">
                        <span className="truncate">
                          {t(KIND_LABELS[kind])}
                          {account ? (
                            <span className="text-ink-3">
                              {' · '}
                              {account.name}
                              {account.last4 ? ` *${account.last4}` : ''}
                            </span>
                          ) : null}
                          {limit !== null && kind !== 'usd' ? (
                            <span className="tabular text-ink-3">
                              {' ≤ '}
                              {formatMoney(limit, 'UZS', { minor: 'auto', symbol: false })}
                            </span>
                          ) : null}
                        </span>
                        <Shortcut combo={KIND_KEYS[kind]} />
                      </span>
                      <MoneyInput
                        value={row.amount}
                        onChange={(amount) => patchTender(row.key, { amount })}
                        currency={row.currency}
                        fillValue={fillOf(row)}
                        disabled={noRate}
                        // Nothing typed anywhere: what shows faintly here is what is meant.
                        placeholder={
                          noRate
                            ? t('pos.noRateShort')
                            : !entered.length && suggested[row.key]
                              ? formatMoney(suggested[row.key], row.currency, { minor: 'auto', symbol: false })
                              : undefined
                        }
                        className="w-40"
                      />
                    </div>
                    {accounts.length > 1 || (!refunding && row.method === 'terminal' && row.amount) ? (
                      <div className="flex items-center justify-end gap-2">
                        {accounts.length > 1 ? (
                          <Select
                            value={row.accountId ?? ''}
                            onChange={(accountId) => patchTender(row.key, { accountId })}
                            options={accounts.map((item) => ({
                              value: item.id,
                              label: item.last4 ? `${item.name} *${item.last4}` : item.name,
                            }))}
                            className="min-w-0 flex-1"
                          />
                        ) : null}
                        {!refunding && row.method === 'terminal' && row.amount ? (
                          <Input
                            value={row.reference}
                            maxLength={12}
                            placeholder={t('pos.rrn')}
                            onChange={(event) => patchTender(row.key, { reference: event.target.value })}
                            className="font-code w-40"
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {row.currency === 'USD' && row.amount && rate ? (
                      <p className="tabular text-right text-xs text-ink-3">
                        = {money(toBase(row.amount, 'USD', rate))}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {!entered.length ? null : refunding ? (
              refund.problem === 'over' ? (
                <p className="text-[13px] text-bad">{t('pos.refundOver')}</p>
              ) : refund.due > 0 ? (
                <p className="text-[13px] text-bad">{t('pos.refundDue', { amount: money(refund.due) })}</p>
              ) : null
            ) : settlement.problem === 'non_cash_over' ? (
              <p className="text-[13px] text-bad">{t('pos.nonCashOver')}</p>
            ) : settlement.due > 0 ? (
              <div className="flex items-baseline justify-between text-[13px] text-bad">
                <span>{t('pos.due')}</span>
                <span className="tabular font-semibold">
                  {money(settlement.due)}
                  {settlement.dueUsd ? ` · ${money(settlement.dueUsd, 'USD')}` : ''}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-ink-3">{t('pos.change')}</span>
                <span className="flex items-center gap-2">
                  {context.usd && rate ? (
                    <Select
                      value={changeCurrency}
                      onChange={(value) => setChangeCurrency(value as CurrencyCode)}
                      options={[
                        { value: 'UZS', label: "so'm" },
                        { value: 'USD', label: '$' },
                      ]}
                      className="h-7 w-20 text-xs"
                    />
                  ) : null}
                  <span className="tabular text-lg font-semibold text-ok">
                    {changeText(settlement.changeUzs, settlement.changeUsd)}
                  </span>
                </span>
              </div>
            )}

            {context.sellers.length > 1 && cart.lines.length ? (
              <Combobox
                options={context.sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
                value={cart.sellerId}
                onChange={(sellerId) => setCart({ ...cart, sellerId })}
                placeholder={t('pos.seller')}
              />
            ) : null}

            <Button
              variant="primary"
              className="h-11 text-sm"
              disabled={!cart.lines.length && !returning}
              loading={busy}
              onClick={complete}
            >
              {returning ? (cart.lines.length ? t('pos.exchangeAction') : t('pos.returnAction')) : t('pos.complete')}
              <Shortcut combo="f9" className="ml-1 opacity-70" />
            </Button>
            {cart.lines.length || returning ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCart(EMPTY_CART)
                  setPaid({})
                  setReturning(null)
                  focusSearch()
                }}
              >
                {t('pos.clear')}
              </Button>
            ) : null}
          </section>
        </aside>
      </div>

      {closing ? <CloseShiftDialog context={context} onClose={() => setClosing(false)} /> : null}
      {picking ? (
        <ReturnPicker
          code={picking.code}
          current={picking.code ? null : returning}
          onPick={(picked) => {
            setReturning(picked)
            setPicking(null)
            window.setTimeout(focusSearch)
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {viewing?.kind === 'sale' ? <SaleDialog saleId={viewing.id} onClose={() => setViewing(null)} /> : null}
      {viewing?.kind === 'return' ? <ReturnDialog returnId={viewing.id} onClose={() => setViewing(null)} /> : null}
    </Page>
  )
}
