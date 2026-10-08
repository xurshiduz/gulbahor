import {
  CURRENCIES,
  currencyOfHeader,
  guessMapping,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  readImportRow,
  todayIn,
  toIsoDate,
  type AnyCurrency,
  type ImportFieldKey,
  type ImportMapping,
  type ImportResult,
  type ImportRow,
  type ImportRowResult,
  type Page as PageOf,
  type PartnerDto,
} from '@erp/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck, Download, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { useSession } from '@/features/auth/session'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { usePreference } from '@/lib/preferences'
import { sha256Hex } from '@/lib/sha256'
import { toast } from '@/lib/toast'

import { useBookOn } from '@/features/money/rates'

import { ReceiptRateField } from './receipt-rate'
import { dayRateOf, DEFAULTS_KEY, NO_DEFAULTS, type ReceiptDefaults } from './receipt-state'

type Cell = string | number | boolean | Date | null

interface Sheet {
  fileName: string
  fileHash: string
  headers: Cell[]
  /** Rows under the header, with the row number each has in the file. */
  rows: { number: number; cells: Cell[] }[]
}

interface LocationOption {
  id: string
  name: string
  code: string
}

const SKIP = 'skip'

/** The first row that looks like a header: at least three cells of text. */
const headerRowOf = (data: Cell[][]) =>
  Math.max(
    0,
    data.findIndex((row) => row.filter((cell) => typeof cell === 'string' && cell.trim()).length >= 3),
  )

async function readSheet(file: File): Promise<Sheet> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const buffer = await file.arrayBuffer()
  const [first] = await readXlsxFile(buffer)
  const data = (first?.data ?? []) as Cell[][]
  const at = headerRowOf(data)
  return {
    fileName: file.name,
    fileHash: await sha256Hex(buffer),
    headers: data[at] ?? [],
    rows: data.slice(at + 1).map((cells, index) => ({ number: at + index + 2, cells })),
  }
}

/** An empty sheet with the columns the import understands, to be filled in and sent back. */
export async function downloadTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile([IMPORT_FIELDS.map((field) => ({ value: field.title, fontWeight: 'bold' as const }))], {
    columns: IMPORT_FIELDS.map((field) => ({ width: Math.max(14, field.title.length + 4) })),
    sheet: 'Kirim',
  }).toFile('kirim-shabloni.xlsx')
}

interface Props {
  locations: LocationOption[]
  onClose: () => void
  onDone: (receiptId: string) => void
}

/**
 * A spreadsheet into a draft receipt, in three looks: pick the file, check
 * which column is what, see what it will add. Nothing is saved until the
 * last button; the preview is the import itself, run and undone.
 */
export function ReceiptImportDialog({ locations, onClose, onDone }: Props) {
  const { t } = useTranslation()
  const { me } = useSession()
  const fileRef = useRef<HTMLInputElement>(null)
  const [defaults] = usePreference<ReceiptDefaults>(DEFAULTS_KEY, NO_DEFAULTS)
  // What each template's columns were mapped to last time, by its header row.
  const [remembered, setRemembered] = usePreference<Record<string, ImportMapping>>('receipt.import.mappings', {})

  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [reading, setReading] = useState(false)
  const [preview, setPreview] = useState<ImportResult | null>(null)

  const [locationId, setLocationId] = useState<string | null>(
    locations.some((location) => location.id === defaults.locationId)
      ? defaults.locationId
      : locations.length === 1
        ? locations[0].id
        : null,
  )
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [docDate, setDocDate] = useState(() => toIsoDate(todayIn(me.org.timezone)))
  // The currencies goods may be bought in: the base and those switched on.
  const kept: AnyCurrency[] = [base(), ...me.org.currencies]
  const [currency, setCurrency] = useState<AnyCurrency>(kept.includes(defaults.currency) ? defaults.currency : base())
  // The day's rate until someone types another.
  const [typedRate, setTypedRate] = useState<number | null>(null)
  const book = useBookOn(docDate).data
  const dayRate = book ? dayRateOf(currency, book) : null
  const rate = typedRate ?? dayRate
  const foreign = currency !== base()

  const suppliers = useQuery({
    queryKey: ['partners', 'suppliers'],
    queryFn: ({ signal }) =>
      api.get<PageOf<PartnerDto>>('/partners', { role: 'supplier', status: 'active', size: 200 }, signal),
  })

  const signature = sheet
    ? sheet.headers
        .map((header) =>
          String(header ?? '')
            .trim()
            .toLowerCase(),
        )
        .join('|')
    : ''

  const open = async (file: File) => {
    setReading(true)
    setPreview(null)
    try {
      const read = await readSheet(file)
      if (!read.rows.length) {
        toast.error(t('import.emptyFile'))
        return
      }
      const key = read.headers
        .map((header) =>
          String(header ?? '')
            .trim()
            .toLowerCase(),
        )
        .join('|')
      const guessed = remembered[key] ?? guessMapping(read.headers)
      setSheet(read)
      setMapping(guessed)
      // "цена закупки YUAN" says what the supplier is paid in.
      const hinted = guessed.price === undefined ? null : currencyOfHeader(read.headers[guessed.price])
      if (hinted && kept.includes(hinted)) {
        setCurrency(hinted)
        setTypedRate(null)
      }
    } catch {
      toast.error(t('import.unreadable'))
    } finally {
      setReading(false)
    }
  }

  const read = useMemo(() => {
    const rows: ImportRow[] = []
    const problems: ImportRowResult[] = []
    for (const row of sheet?.rows ?? []) {
      const result = readImportRow(row.cells, mapping, row.number)
      if (result?.value) {
        rows.push(result.value)
      } else if (result) {
        problems.push({ row: result.row, problems: result.problems })
      }
    }
    return { rows, problems }
  }, [sheet, mapping])

  const send = useMutation({
    mutationFn: (dryRun: boolean) =>
      api.post<ImportResult>('/receipts/import', {
        dryRun,
        locationId,
        supplierId,
        docDate,
        currency,
        rate: foreign ? rate : null,
        fileName: (sheet as Sheet).fileName,
        fileHash: (sheet as Sheet).fileHash,
        rows: read.rows,
      }),
    meta: { silent: true },
    onSuccess: (result, dryRun) => {
      setRemembered({ ...remembered, [signature]: mapping })
      if (!dryRun && result.receiptId) {
        toast.success(t('import.done', { number: result.receiptNumber }))
        onDone(result.receiptId)
        return
      }
      setPreview(result)
    },
    onError: (error) => {
      const fields = error instanceof ApiError ? error.fields : undefined
      toast.error(fields ? Object.values(fields)[0] : (error as Error).message)
    },
  })

  const ready =
    !!sheet &&
    !!locationId &&
    (!foreign || !!rate) &&
    mapping.name !== undefined &&
    mapping.qty !== undefined &&
    read.rows.length > 0 &&
    read.rows.length <= MAX_IMPORT_ROWS
  const localProblems = read.problems
  const problems = [...localProblems, ...(preview?.problems ?? [])].sort((a, b) => a.row - b.row)
  const sample = sheet?.rows[0]?.cells ?? []

  const columnOptions = [
    { value: SKIP, label: '—' },
    ...(sheet?.headers ?? []).flatMap((header, index) =>
      header === null || String(header).trim() === '' ? [] : [{ value: String(index), label: String(header) }],
    ),
  ]

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={t('import.title')}
      description={t('import.subtitle')}
      footer={
        <>
          <Button variant="ghost" onClick={() => void downloadTemplate()} className="mr-auto">
            <Download />
            {t('import.template')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {preview && !problems.length ? (
            <Button variant="primary" onClick={() => send.mutate(false)} loading={send.isPending}>
              {t('import.confirm', { count: preview.rows })}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => send.mutate(true)} loading={send.isPending} disabled={!ready}>
              {t('import.check')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              void open(file)
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const file = event.dataTransfer.files[0]
            if (file) {
              void open(file)
            }
          }}
          className={cn(
            'flex items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft/40',
            !sheet && 'py-8',
          )}
        >
          {sheet ? <FileSpreadsheet className="size-5 text-ok" /> : <Upload className="size-5 text-ink-3" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">
              {reading ? t('common.loading') : sheet ? sheet.fileName : t('import.choose')}
            </span>
            <span className="block text-xs text-ink-3">
              {sheet ? t('import.rowsFound', { count: sheet.rows.length }) : t('import.chooseHint')}
            </span>
          </span>
          {sheet ? <span className="text-xs text-accent-ink">{t('import.another')}</span> : null}
        </button>

        {sheet ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('receipts.location')} required>
                {(id) => (
                  <Combobox
                    id={id}
                    options={locations.map((location) => ({
                      value: location.id,
                      label: location.name,
                      hint: location.code,
                    }))}
                    value={locationId}
                    onChange={(value) => (setLocationId(value), setPreview(null))}
                  />
                )}
              </Field>
              <Field
                label={t('receipts.supplier')}
                hint={mapping.supplier !== undefined ? t('import.supplierHint') : undefined}
              >
                {(id) => (
                  <Combobox
                    id={id}
                    options={(suppliers.data?.items ?? []).map((partner) => ({
                      value: partner.id,
                      label: partner.name,
                    }))}
                    value={supplierId}
                    onChange={(value) => (setSupplierId(value), setPreview(null))}
                  />
                )}
              </Field>
              <Field label={t('receipts.date')} required>
                {(id) => (
                  <DateInput id={id} value={docDate} onChange={(value) => (setDocDate(value), setPreview(null))} />
                )}
              </Field>
              <Field label={t('receipts.currency')}>
                {(id) => (
                  <Select
                    id={id}
                    value={currency}
                    onChange={(value) => {
                      setCurrency(value as AnyCurrency)
                      setTypedRate(null)
                      setPreview(null)
                    }}
                    options={kept.map((code) => ({
                      value: code,
                      label: `${code} · ${CURRENCIES[code].name}`,
                    }))}
                  />
                )}
              </Field>
              {foreign ? (
                <ReceiptRateField
                  currency={currency}
                  value={rate}
                  onChange={(value) => (setTypedRate(value), setPreview(null))}
                  dayRate={dayRate}
                />
              ) : null}
            </div>

            <div>
              <p className="eyebrow mb-2">{t('import.columns')}</p>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_FIELDS.map((field) => {
                  const column = mapping[field.key as ImportFieldKey]
                  const shown = column === undefined ? null : sample[column]
                  const needed = field.key === 'name' || field.key === 'qty'
                  return (
                    <div key={field.key} className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs font-medium text-ink-2">
                        {field.title}
                        {needed ? <span className="ml-0.5 text-bad">*</span> : null}
                      </span>
                      <Select
                        value={column === undefined ? SKIP : String(column)}
                        invalid={needed && column === undefined}
                        onChange={(value) => {
                          const next = { ...mapping }
                          if (value === SKIP) {
                            delete next[field.key as ImportFieldKey]
                          } else {
                            // A column feeds one field: taking it here frees it from wherever it was.
                            for (const key of Object.keys(next) as ImportFieldKey[]) {
                              if (next[key] === Number(value)) {
                                delete next[key]
                              }
                            }
                            next[field.key as ImportFieldKey] = Number(value)
                          }
                          setMapping(next)
                          setPreview(null)
                        }}
                        options={columnOptions}
                      />
                      <span className="h-4 truncate text-xs text-ink-3">
                        {shown === null || shown === undefined || shown === '' ? '' : String(shown)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {read.rows.length > MAX_IMPORT_ROWS ? (
              <Notice tone="bad">{t('import.tooMany', { max: formatNumber(MAX_IMPORT_ROWS) })}</Notice>
            ) : null}

            {problems.length ? (
              <Notice tone="bad" title={t('import.problems', { count: problems.length })}>
                <ul className="mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                  {problems.map((problem) => (
                    <li key={`${problem.row}:${problem.problems[0]}`}>
                      <span className="tabular font-medium">{t('import.row', { row: problem.row })}</span>{' '}
                      {problem.problems.join('; ')}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-ink-2">{t('import.problemsHint')}</p>
              </Notice>
            ) : null}

            {preview && !problems.length ? (
              <Notice tone="ok" title={t('import.ready', { rows: preview.rows, qty: formatNumber(preview.qty) })}>
                <ul className="mt-1.5 flex flex-col gap-0.5 text-ink-2">
                  <Added label={t('import.newProducts')} items={preview.newProducts} />
                  {preview.newVariants ? <li>{t('import.newVariants', { count: preview.newVariants })}</li> : null}
                  <Added label={t('import.newValues')} items={preview.newValues} />
                  <Added label={t('import.newBrands')} items={preview.newBrands} />
                  <Added label={t('import.newCategories')} items={preview.newCategories} />
                  <Added label={t('import.newSuppliers')} items={preview.newSuppliers} />
                  {!preview.newProducts.length && !preview.newVariants ? <li>{t('import.nothingNew')}</li> : null}
                </ul>
              </Notice>
            ) : null}
            {preview?.duplicateOf ? (
              <Notice tone="warn">{t('import.duplicate', { number: preview.duplicateOf })}</Notice>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  )
}

function Added({ label, items }: { label: string; items: string[] }) {
  if (!items.length) {
    return null
  }
  const shown = items.slice(0, 8).join(', ')
  return (
    <li>
      <span className="font-medium text-ink">
        {label} ({items.length}):
      </span>{' '}
      {shown}
      {items.length > 8 ? '…' : ''}
    </li>
  )
}

const TONES = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' }

function Notice({ tone, title, children }: { tone: keyof typeof TONES; title?: string; children?: ReactNode }) {
  const Icon = tone === 'ok' ? CircleCheck : TriangleAlert
  return (
    <div className={cn('flex gap-2.5 rounded-md px-3 py-2.5 text-xs', TONES[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="text-[13px] font-medium">{title}</p> : null}
        {children}
      </div>
    </div>
  )
}
