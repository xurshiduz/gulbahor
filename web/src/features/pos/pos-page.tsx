import {
  formatMoney,
  overDiscountLimit,
  overRateLoss,
  settle,
  settleRefund,
  toBase,
  type ApprovalInput,
  type CurrencyCode,
  type PosContextDto,
  type PosCustomerDto,
  type PosItemDto,
  type ReaderTagEvent,
  type ReturnDto,
  type SaleDto,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { HandCoins, Lock, Receipt, ScanLine, Search, Store, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

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
import { useCovered, useHotkey } from '@/lib/hotkeys'
import { useShopEvent } from '@/lib/realtime'
import { useScanner } from '@/lib/scanner'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

import {
  addToCart,
  agreedOf,
  agreedText,
  autoReasons,
  backLines,
  badDiscount,
  cartTotals,
  changeText,
  EMPTY_CART,
  enteredRows,
  linesTotal,
  refundRows,
  splitMultiplier,
  suggestRefunds,
  tenderRows,
  tendersOf,
  underFloor,
  type Cart,
  type Returning,
  type TenderRow,
} from './pos-state'
import { AgreedSum } from './agreed'
import { ApprovalDialog } from './approval'
import { HandoverDialog, WaitingTransfers } from './handover'
import { ReturnDialog, ReturnPicker } from './return-parts'
import { PromoCode } from './promo-code'
import { ReceiptPreview } from './receipt-preview'
import { SaleDialog } from './sale-dialog'
import { kindOf, TenderPanel, type TenderKind } from './tender-panel'
import { CustomerPicker, type CustomerPickerHandle } from './customer-picker'
import { CloseShiftDialog, OpenShift } from './shift-parts'

const route = getRouteApi('/pos')

const REGISTER_KEY = 'gb.pos.register'
/** The retail price in the list of price types: it has no id of its own there. */
const RETAIL = 'retail'
const cartKey = (registerId: string) => `gb.pos.cart.${registerId}`

const money = (minor: number, currency: CurrencyCode = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

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
 * The sale screen, in two stages. First the goods: one field takes
 * everything, a scanned barcode or tag, an article, a name, and "3*" before
 * any of them for three; beside the cart is what it comes to. Then, on F9,
 * the money: the receipt as it will be on the left, and on the right a row
 * for every way of paying, with what is still due or the change under them.
 * Goods that change while they are being paid for take the till back to the
 * cart.
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
  const customerRef = useRef<CustomerPickerHandle>(null)
  const agreedRef = useRef<HTMLInputElement>(null)
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
  /** The goods are agreed on and the money is being taken: the receipt is shown, the cart is not. */
  const [paying, setPaying] = useState(false)
  /** Where the cursor goes when that changes: a way of paying on the way in, a field of the cart on the way back. */
  const wanted = useRef<TenderKind | 'agreed' | null>(null)
  const [changeCurrency, setChangeCurrency] = useState<CurrencyCode>('UZS')
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [closing, setClosing] = useState(false)
  const [handing, setHanding] = useState(false)
  /** A manager is being asked for their word: who may give it, and for what. */
  const [asking, setAsking] = useState<{ who: { id: string; name: string }[]; reason: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [last, setLast] = useState<LastDocument | null>(null)
  const [viewing, setViewing] = useState<LastDocument | null>(null)
  // The price types this cart may be sold at: those this person may pick, and the one the customer's group gives.
  const theirs = cart.customer?.priceType ?? null
  const priceTypes = useMemo(
    () => [
      ...context.priceTypes,
      ...(theirs && !context.priceTypes.some((type) => type.id === theirs.id) ? [{ ...theirs, needsWord: false }] : []),
    ],
    [context.priceTypes, theirs],
  )
  // The one it is sold at: one that is no longer among them falls back to the retail price. A price that
  // comes with the customer needs nobody's word.
  const picked = priceTypes.find((type) => type.id === cart.priceTypeId) ?? null
  const priceType = picked && picked.id === theirs?.id ? { ...picked, needsWord: false } : picked
  const priceTypeId = priceType?.id ?? null
  const promoCode = cart.promoCode ?? null

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
    queryKey: ['pos', 'search', registerId, query, priceTypeId, promoCode],
    queryFn: ({ signal }) =>
      api.get<PosItemDto[]>(
        '/pos/search',
        { registerId, q: query, priceTypeId: priceTypeId ?? undefined, promoCode: promoCode ?? undefined },
        signal,
      ),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
  })
  const results = query.length >= 2 && rest === query ? (found.data ?? []) : []

  const focusSearch = () => searchRef.current?.focus()

  // Scans come faster than their answers. Each is added to the cart as it stands when the answer arrives,
  // not as it stood when the code was sent: otherwise the second of two would undo the first.
  const cartRef = useRef(cart)
  cartRef.current = cart
  const scanned = useRef(Promise.resolve())
  /** Pieces the till's reader has reported and that are being looked up right now. */
  const laid = useRef(new Set<string>())

  const add = (item: PosItemDto, qty = 1): boolean => {
    if (item.price === null) {
      toast.error(t('pos.noPrice', { name: item.name }))
      return false
    }
    const next = addToCart(cartRef.current, item, qty)
    if (!next.added) {
      toast.info(t('pos.alreadyInCart'))
      return false
    }
    cartRef.current = next.cart
    setCart(next.cart)
    return true
  }

  /** Something chosen from the list under the search field. */
  const pick = (item: PosItemDto) => {
    if (add(item, multiplier ?? 1)) {
      setText('')
      focusSearch()
    }
  }

  /**
   * A code, scanned or typed in full. The field is free for the next one at
   * once; the answer comes later and touches neither the field nor the
   * cursor, which by then may be in the middle of the next code or of a sum.
   */
  const lookup = (code: string, qty: number, typed = true): Promise<void> => {
    if (typed) {
      setText('')
    }
    const answer = api
      .get<PosItemDto>('/pos/lookup', {
        registerId,
        code,
        priceTypeId: priceTypeId ?? undefined,
        promoCode: promoCode ?? undefined,
      })
      .then(
        (item) => ({ item }),
        (error: unknown) => ({ error }),
      )
    // Asked at once, added in the order they were scanned: the cart reads the way the goods were passed.
    scanned.current = scanned.current.then(async () => {
      const found = await answer
      if ('item' in found) {
        add(found.item, qty)
      } else {
        toast.error(found.error instanceof ApiError ? found.error.message : String(found.error), {
          description: code,
        })
      }
    })
    return scanned.current
  }

  /** Asks for the cart's things again: a price or a count may have changed since they were put there. */
  const refresh = useMutation({
    mutationFn: ({ variantIds, at, code }: { variantIds: string[]; at: string | null; code: string | null }) =>
      api.post<PosItemDto[]>('/pos/items', { registerId, variantIds, priceTypeId: at, promoCode: code }),
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
  const refreshCart = (at: string | null = priceTypeId, code: string | null = promoCode) =>
    cart.lines.length
      ? refresh.mutate({ variantIds: cart.lines.map((line) => line.item.variantId), at, code })
      : undefined
  /** A promotion code was said, or taken back: the goods are asked about again, with it or without. */
  const sayCode = (code: string | null) => {
    setCart((current) => ({ ...current, promoCode: code }))
    refreshCart(priceTypeId, code)
    window.setTimeout(focusSearch)
  }
  /** The cart goes over to another price type: every line is priced again. */
  const sellAt = (id: string | null) => {
    setCart((current) => ({ ...current, priceTypeId: id }))
    refreshCart(id)
  }
  /**
   * Someone is at the counter, or no longer is. The price their group gives comes with them and leaves
   * with them; a price the cashier picked stays as it was.
   */
  const serve = (customer: PosCustomerDto | null) => {
    const kept = context.priceTypes.some((type) => type.id === cart.priceTypeId) ? (cart.priceTypeId ?? null) : null
    const at = customer?.priceType?.id ?? kept
    setCart((current) => ({ ...current, customer, priceTypeId: at }))
    if (at !== priceTypeId) {
      refreshCart(at)
    }
    // Found, the cursor goes back to the goods.
    window.setTimeout(focusSearch)
  }

  // A window opened over the till (a partner's payment) takes the keys, the scanner and the reader.
  const covered = useCovered()
  const idle = !closing && !viewing && !picking && !handing && !asking && !covered
  // A scan lands in the cart wherever the cursor is; a count typed before it applies to it.
  useScanner((code) => lookup(code, multiplier ?? 1), { enabled: idle })
  // A piece laid on this till's reader goes into the receipt as if it had been scanned. Nobody typed
  // anything, so the search field is left alone. A reader says the same thing more than once: a piece
  // already in the receipt, or on its way there, is not asked about again and nobody is told so.
  useShopEvent<ReaderTagEvent>(
    'reader.tag',
    ({ registerId: till, epc }) => {
      if (till !== registerId || laid.current.has(epc) || cartRef.current.lines.some((line) => line.item.epc === epc)) {
        return
      }
      laid.current.add(epc)
      void lookup(epc, 1, false).finally(() => laid.current.delete(epc))
    },
    idle,
  )

  const handleSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((current) => (results.length ? (current + delta + results.length) % results.length : 0))
    } else if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (results[highlight]) {
        pick(results[highlight])
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
  // The customer's own discount comes off by itself, and only off the retail price: a price of their own
  // is already what they were given.
  const ownPercent = priceTypeId ? 0 : (cart.customer?.discountPercent ?? 0)
  const totals = useMemo(() => cartTotals(cart, ownPercent), [cart, ownPercent])
  /** What a discount on the whole sale is taken from. */
  const afterLines = useMemo(() => linesTotal(cart, ownPercent), [cart, ownPercent])
  /** Why money comes off by itself: the promotions that took part, and the customer's own reason. */
  const autoReason = autoReasons(totals.autos, cart.customer?.discountReason ?? null)

  // A sum agreed on was agreed for the goods that were in the cart. When they change it no longer
  // stands: left in place, whatever was added after it would be given away.
  const goods = cart.lines
    .map((line) => [line.item.variantId, line.item.epc, line.qty, line.item.price, line.discountText].join(':'))
    // What comes off by itself (a promotion, the customer's own) changes what there is to agree on, as the
    // goods do.
    .concat(String(totals.auto))
    .join('|')
  const agreedFor = useRef(goods)
  useEffect(() => {
    if (agreedFor.current === goods) {
      return
    }
    agreedFor.current = goods
    // What was being paid for is no longer what is in the cart: back to it, to be looked at again.
    setPaying(false)
    if (agreedOf(cart.discountText) !== null) {
      setCart((current) => ({ ...current, discountText: '' }))
      if (cart.lines.length) {
        toast.warning(t('pos.agreedReset'))
      }
    }
    // Only a change of the goods matters here; the discount is read as it stands at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goods])
  // What the cashier gave of their own accord, as a share of what was left to give it from: the customer's
  // own discount is neither counted in it nor held against the limit.
  const given = totals.discount - totals.auto
  const percent = totals.subtotal - totals.auto ? (given * 100) / (totals.subtotal - totals.auto) : 0
  const overLimit = overDiscountLimit(totals, context.maxDiscountPercent) && !context.mayOverDiscount
  /** The lines under what their thing may go for. Who may discount beyond the limit sells them alone. */
  const under = useMemo(() => underFloor(cart, totals), [cart, totals])
  const underAsk = under.length > 0 && !context.mayOverDiscount
  /** The cart is sold at a price type that takes a manager's word. */
  const priceAsk = !!priceType?.needsWord && cart.lines.length > 0
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
  const entered = enteredRows(tenders)
  const typed = tendersOf(entered, refunding)
  /** Dollars taken for more over the rate than the shop lets a cashier give alone. */
  const overRate = !refunding && !!rate && overRateLoss(typed, rate, context.maxRateLossPercent)
  const rateAsk = overRate && !context.mayOverDiscount
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

  const focusField = (kind: TenderKind) => {
    const field = document.querySelector<HTMLInputElement>(`[data-kind="${kind}"] input`)
    field?.focus()
    field?.select()
  }
  // Into the payment the cursor goes to the way of paying that was asked for, so'm when none was; back
  // in the cart, to the search field or to the sum agreed on.
  useEffect(() => {
    const want = wanted.current
    wanted.current = null
    if (paying) {
      focusField(want && want !== 'agreed' ? want : 'cash')
    } else if (want === 'agreed') {
      agreedRef.current?.focus()
    } else {
      focusSearch()
    }
  }, [paying])

  /** F9 in the cart: the goods are agreed on, now the money. */
  const openPay = (kind: TenderKind | null = null) => {
    if (!cart.lines.length && !returning) {
      return
    }
    if (
      cart.lines.some((line, index) =>
        badDiscount(line.discountText, (totals.lines[index]?.gross ?? 0) - (totals.lines[index]?.auto ?? 0)),
      ) ||
      badDiscount(cart.discountText, afterLines)
    ) {
      toast.error(t('pos.badDiscount'))
      return
    }
    wanted.current = kind
    setPaying(true)
  }
  /** Back to the cart; what was typed for the money stays. */
  const backToCart = (to: 'agreed' | null = null) => {
    if (!paying) {
      if (to === 'agreed') {
        agreedRef.current?.focus()
      } else {
        focusSearch()
      }
      return
    }
    wanted.current = to
    setPaying(false)
  }

  /** F5…F8: the cursor goes to that way of paying, from the cart as well. */
  const focusTender = (kind: TenderKind) => {
    if (!tenders.some((item) => kindOf(item) === kind)) {
      if (kind === 'card' || kind === 'terminal') {
        toast.error(refunding ? t('pos.notPaidThatWay') : kind === 'card' ? t('pos.noCards') : t('pos.noTerminals'))
      }
      return
    }
    if (kind === 'usd' && !rate) {
      toast.error(t('pos.noRate'))
      return
    }
    if (paying) {
      focusField(kind)
    } else {
      openPay(kind)
    }
  }
  const patchTender = (key: string, patch: Partial<TenderRow>) =>
    setPaid((current) => ({ ...current, [key]: { ...current[key], ...patch } }))

  // ── Done ──
  const reset = () => {
    clientKey.current = uuid()
    setCart(EMPTY_CART)
    setPaid({})
    setReturning(null)
    setPaying(false)
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

  const complete = (approval: ApprovalInput | null = null) => {
    if (busy || (!cart.lines.length && !returning)) {
      return
    }
    if (
      cart.lines.some((line, index) =>
        badDiscount(line.discountText, (totals.lines[index]?.gross ?? 0) - (totals.lines[index]?.auto ?? 0)),
      ) ||
      badDiscount(cart.discountText, afterLines)
    ) {
      toast.error(t('pos.badDiscount'))
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
          ...(!refunding && row.currency === 'USD' && row.value ? { value: row.value } : {}),
          reference: row.reference || null,
        }))
      : tenders.flatMap((row) =>
          suggested[row.key]
            ? [{ method: row.method, accountId: row.accountId, currency: row.currency, amount: suggested[row.key] }]
            : [],
        )
    // What the cashier may not do alone waits for a manager's PIN; with it, the same deed is sent again.
    const beyond =
      refunding &&
      !!returning &&
      !returning.found.free &&
      (toRefund -
        amounts.reduce(
          (sum, row) => sum + (row.method === 'cash' ? 0 : toBase(row.amount as number, row.currency, rate)),
          0,
        ) >
        returning.found.caps.cash ||
        returning.found.caps.accounts.some(
          (cap) =>
            amounts.reduce((sum, row) => sum + (row.accountId === cap.accountId ? (row.amount as number) : 0), 0) >
            cap.left,
        ))
    const late = !!returning && returning.found.late && !returning.found.free
    // Goods taken instead of the ones brought back, for a customer whose group does not have that done.
    const barred = !!returning && returning.found.noExchange && cart.lines.length > 0 && !returning.found.free
    if (!approval && (overLimit || underAsk || rateAsk || priceAsk || late || beyond || barred)) {
      const who = context.approvers.filter(
        (approver) =>
          (!(overLimit || underAsk || rateAsk) || approver.discount) &&
          (!priceAsk || approver.prices) &&
          (!(late || beyond || barred) || approver.returns),
      )
      if (!who.length) {
        toast.error(t('pos.noApprover'))
        return
      }
      setAsking({
        who,
        reason: [
          priceAsk ? t('pos.approvalPrice', { name: priceType?.name }) : null,
          overLimit
            ? t('pos.approvalDiscount', {
                percent: percent.toFixed(1).replace('.', ','),
                limit: context.maxDiscountPercent,
              })
            : null,
          ...(underAsk
            ? under.map(({ index, floor }) =>
                t('pos.approvalFloor', {
                  name: cart.lines[index].item.name,
                  sum: money(totals.lines[index].total),
                  floor: money(floor),
                }),
              )
            : []),
          ...(rateAsk
            ? typed.flatMap((item) =>
                item.value && overRateLoss([item], rate, context.maxRateLossPercent)
                  ? [
                      t('pos.approvalRate', {
                        usd: money(item.amount, 'USD'),
                        sum: money(item.value),
                        book: money(toBase(item.amount, 'USD', rate)),
                      }),
                    ]
                  : [],
              )
            : []),
          late ? t('pos.returnLate', { days: returning?.found.returnDays }) : null,
          barred ? t('pos.approvalExchange', { name: returning?.found.sale.customerName }) : null,
          beyond ? t('pos.approvalRefund') : null,
        ]
          .filter(Boolean)
          .join('. '),
      })
      return
    }
    const goods = {
      sellerId: cart.sellerId,
      customerId: cart.customer?.id ?? null,
      priceTypeId,
      promoCode,
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
      sell.mutate({ clientKey: clientKey.current, registerId, ...goods, payments: amounts, approval })
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
        approval,
      },
      change:
        !refunding && (settlement.changeUzs || settlement.changeUsd)
          ? changeText(settlement.changeUzs, settlement.changeUsd)
          : '',
    })
  }

  const group = t('pos.title')
  useHotkey('f2', () => backToCart(), { label: t('pos.search'), group, enabled: idle })
  useHotkey('f3', () => backToCart('agreed'), {
    label: t('pos.agreed'),
    group,
    enabled: idle && cart.lines.length > 0,
  })
  useHotkey('f4', () => setPicking({}), { label: t('pos.returnTitle'), group, enabled: idle && mayReturn })
  useHotkey(
    'alt+m',
    () => {
      backToCart()
      // The field is there once the cart is back on the screen.
      window.setTimeout(() => customerRef.current?.focus())
    },
    { label: t('pos.customer'), group, enabled: idle },
  )
  useHotkey('f5', () => focusTender('cash'), { label: t('pos.payCash'), group, enabled: idle })
  useHotkey('f6', () => focusTender('usd'), { label: t('pos.payUsd'), group, enabled: idle && context.usd })
  useHotkey('f7', () => focusTender('card'), { label: t('pos.payCard'), group, enabled: idle })
  useHotkey('f8', () => focusTender('terminal'), { label: t('pos.payTerminal'), group, enabled: idle })
  // F9 takes the till to the money, and from there ends the sale: twice, it is a sale for cash, exactly.
  useHotkey('f9', () => (paying ? complete() : openPay()), { label: t('pos.pay'), group, enabled: idle })
  // Cash, exactly, without looking at the money at all.
  useHotkey('mod+enter', () => complete(), { label: t('pos.quickSale'), group, enabled: idle })
  useHotkey('escape', () => backToCart(), { enabled: idle && paying })

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
      <div
        className={cn('grid min-h-0 flex-1 gap-4', paying ? 'lg:grid-cols-[1fr_26rem]' : 'lg:grid-cols-[1fr_22rem]')}
      >
        {/* ── The cart; while it is being paid, the receipt it makes ── */}
        {paying ? (
          <ReceiptPreview
            shop={context.register.locationName}
            register={context.register.name}
            cart={cart}
            totals={totals}
            back={back}
            backNumber={returning?.found.sale.number ?? null}
            priceType={priceType?.name ?? null}
            customer={cart.customer?.name ?? null}
            ownReason={autoReason || null}
            credit={credit}
            toPay={toPay}
            toRefund={toRefund}
            seller={context.sellers.find((seller) => seller.id === cart.sellerId)?.name ?? null}
          />
        ) : (
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
                        onClick={() => pick(item)}
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
                      <th className="w-36 px-3 py-2 text-right">{t('pos.total')}</th>
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
                      // What the line is worth once the customer's own discount is off: what the cashier's
                      // discount, or a price agreed on, is counted from.
                      const whole = (totals.lines[index]?.gross ?? 0) - (totals.lines[index]?.auto ?? 0)
                      const floor = under.find((item) => item.index === index)?.floor
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
                              {floor !== undefined ? (
                                <span className="text-bad">{t('pos.floor', { amount: money(floor) })}</span>
                              ) : null}
                              {totals.autos[index]?.promoOff ? (
                                <span className="text-accent-ink">
                                  {totals.autos[index].promo?.name} −{money(totals.autos[index].promoOff)}
                                </span>
                              ) : null}
                            </p>
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberInput
                              value={line.qty}
                              // A sum agreed on for the line was for that many: with another count it is asked again.
                              onChange={(qty) =>
                                qty
                                  ? patch({
                                      qty,
                                      ...(agreedOf(line.discountText) === null ? {} : { discountText: '' }),
                                    })
                                  : undefined
                              }
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
                              invalid={badDiscount(line.discountText, whole)}
                              onChange={(event) => patch({ discountText: event.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {/* The price agreed on for the line is typed straight in: what comes off is the rest. */}
                            <MoneyInput
                              value={whole - totals.lineDiscounts[index]}
                              onChange={(agreed) =>
                                patch({ discountText: agreed === null || agreed === whole ? '' : agreedText(agreed) })
                              }
                              invalid={badDiscount(line.discountText, whole) || floor !== undefined}
                              className="[&_input]:font-semibold"
                            />
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
        )}

        {/* ── The sum; while it is being paid, the money ── */}
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
            {context.safes.length ? (
              <Button onClick={() => setHanding(true)}>
                <HandCoins />
                {t('pos.handover')}
              </Button>
            ) : null}
            <Button onClick={() => setClosing(true)}>
              <Lock />
              {t('pos.closeShiftAction')}
            </Button>
          </div>
          <WaitingTransfers transfers={context.transfers} />
          {paying ? (
            <TenderPanel
              context={context}
              rows={tenders}
              onPatch={patchTender}
              returning={returning}
              refunding={refunding}
              due={refunding ? toRefund : toPay}
              suggested={suggested}
              settlement={settlement}
              refund={refund}
              changeCurrency={changeCurrency}
              onChangeCurrency={setChangeCurrency}
              action={
                returning ? (cart.lines.length ? t('pos.exchangeAction') : t('pos.returnAction')) : t('pos.complete')
              }
              busy={busy}
              onComplete={() => complete()}
              onBack={() => backToCart()}
            />
          ) : (
            <>
              <CustomerPicker
                ref={customerRef}
                registerId={registerId}
                value={cart.customer ?? null}
                onChange={serve}
              />
              <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
                {/* A code is for a promotion, and promotions are for the retail price. */}
                {context.promoCodes && !priceTypeId ? (
                  <PromoCode registerId={registerId} value={promoCode} onChange={sayCode} />
                ) : null}
                {priceTypes.length ? (
                  <div className="mb-2 flex items-center justify-between gap-3 text-[13px] text-ink-3">
                    <span>{t('pos.priceType')}</span>
                    <Select
                      value={priceTypeId ?? RETAIL}
                      onChange={(value) => sellAt(value === RETAIL ? null : value)}
                      options={[
                        { value: RETAIL, label: t('pos.retailPrice') },
                        ...priceTypes.map((type) => ({ value: type.id, label: type.name })),
                      ]}
                      className={cn('h-8 w-36', priceType && 'font-medium text-accent-ink')}
                    />
                  </div>
                ) : null}
                {priceAsk ? (
                  <p className="-mt-1 mb-2 text-right text-xs text-warn">
                    {t(context.approvers.some((approver) => approver.prices) ? 'pos.priceAsk' : 'pos.priceStop')}
                  </p>
                ) : null}
                <div className="flex items-baseline justify-between text-[13px] text-ink-3">
                  <span>{t('pos.subtotal')}</span>
                  <span className="tabular">{money(totals.subtotal)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-ink-3">
                  <span>{t('pos.saleDiscount')}</span>
                  <Input
                    value={cart.discountText}
                    placeholder="10% / 5000"
                    invalid={badDiscount(cart.discountText, afterLines) || overLimit}
                    onChange={(event) => setCart({ ...cart, discountText: event.target.value })}
                    className="w-36 text-right"
                  />
                </div>
                {cart.lines.length ? (
                  <AgreedSum
                    ref={agreedRef}
                    text={cart.discountText}
                    base={afterLines}
                    onChange={(discountText) => setCart({ ...cart, discountText })}
                  />
                ) : null}
                {totals.auto ? (
                  <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px] text-accent-ink">
                    <span className="min-w-0 truncate">{autoReason || t('pos.customerDiscount')}</span>
                    <span className="tabular shrink-0">−{money(totals.auto)}</span>
                  </div>
                ) : null}
                {given ? (
                  <div
                    className={cn(
                      'mt-2 flex items-baseline justify-between text-[13px]',
                      overLimit ? 'text-bad' : 'text-ink-3',
                    )}
                  >
                    <span>
                      {t('pos.discount')} ({percent.toFixed(1).replace('.', ',')}%)
                    </span>
                    <span className="tabular">−{money(given)}</span>
                  </div>
                ) : null}
                {overLimit ? (
                  <p className="mt-1 text-xs text-bad">
                    {t(context.approvers.some((approver) => approver.discount) ? 'pos.overLimitAsk' : 'pos.overLimit', {
                      percent: context.maxDiscountPercent,
                    })}
                  </p>
                ) : null}
                {underAsk ? (
                  <p className="mt-1 text-xs text-bad">
                    {t(context.approvers.some((approver) => approver.discount) ? 'pos.floorAsk' : 'pos.floorStop')}
                  </p>
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
                  onClick={() => openPay()}
                >
                  {refunding ? t('pos.refundStep') : t('pos.pay')}
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
            </>
          )}
        </aside>
      </div>

      {closing ? <CloseShiftDialog context={context} onClose={() => setClosing(false)} /> : null}
      {handing ? <HandoverDialog context={context} onClose={() => setHanding(false)} /> : null}
      {picking ? (
        <ReturnPicker
          code={picking.code}
          current={picking.code ? null : returning}
          mayAsk={context.approvers.some((approver) => approver.returns)}
          onPick={(picked) => {
            setReturning(picked)
            setPicking(null)
            window.setTimeout(focusSearch)
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {asking ? (
        <ApprovalDialog
          approvers={asking.who}
          reason={asking.reason}
          onApprove={(approval) => {
            setAsking(null)
            complete(approval)
          }}
          onClose={() => setAsking(null)}
        />
      ) : null}
      {viewing?.kind === 'sale' ? <SaleDialog saleId={viewing.id} onClose={() => setViewing(null)} /> : null}
      {viewing?.kind === 'return' ? <ReturnDialog returnId={viewing.id} onClose={() => setViewing(null)} /> : null}
    </Page>
  )
}
