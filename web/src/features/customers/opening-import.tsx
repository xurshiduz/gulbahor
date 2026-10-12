import {
  formatMoney,
  guessOpeningMapping,
  MAX_OPENING_ROWS,
  OPENING_FIELDS,
  openingMappingProblem,
  readOpeningRow,
  todayIn,
  type AnyCurrency,
  type OpeningImportResult,
  type OpeningRow,
} from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Download, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/feedback'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

import { Balance, balanceText } from './balance'

type Cell = string | number | boolean | Date | null

interface Sheet {
  fileName: string
  headers: Cell[]
  /** Rows under the header, with the row number each has in the file. */
  rows: { number: number; cells: Cell[] }[]
}

/** The first row that looks like a header: at least two cells of text. */
const headerRowOf = (data: Cell[][]) =>
  Math.max(
    0,
    data.findIndex((row) => row.filter((cell) => typeof cell === 'string' && cell.trim()).length >= 2),
  )

async function readSheet(file: File): Promise<Sheet> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const [first] = await readXlsxFile(await file.arrayBuffer())
  const data = (first?.data ?? []) as Cell[][]
  const at = headerRowOf(data)
  return {
    fileName: file.name,
    headers: data[at] ?? [],
    rows: data.slice(at + 1).map((cells, index) => ({ number: at + index + 2, cells })),
  }
}

/** An empty sheet with the columns the import understands, to be filled in and sent back. */
export async function downloadOpeningTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile([OPENING_FIELDS.map((field) => ({ value: field.title, fontWeight: 'bold' as const }))], {
    columns: OPENING_FIELDS.map((field) => ({ width: Math.max(14, field.title.length + 4) })),
    sheet: 'Qoldiqlar',
  }).toFile('boshlangich-qoldiqlar.xlsx')
}

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

interface Props {
  /** The business's time zone: a day typed in the sheet is read as a day there. */
  timeZone?: string
  onClose: () => void
}

/**
 * What stood between the business and its customers before the books began,
 * from a spreadsheet: pick the file, see what it would write — who is found,
 * who is new, what each would owe — and only then write it. Nothing is saved
 * until the last button; the check is the import itself, run and undone.
 */
export function OpeningImportDialog({ timeZone, onClose }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [reading, setReading] = useState(false)
  const [preview, setPreview] = useState<OpeningImportResult | null>(null)
  // One for the file as it was read: checked and then written under the same key, it is written once.
  const [clientKey, setClientKey] = useState(uuid)

  const mapping = useMemo(() => guessOpeningMapping(sheet?.headers ?? []), [sheet])
  const unreadable = sheet ? openingMappingProblem(mapping) : null
  const read = useMemo(() => {
    if (!sheet || unreadable) {
      return []
    }
    const today = todayIn(timeZone)
    return sheet.rows.flatMap((row) => readOpeningRow(row.cells, mapping, row.number, today) ?? [])
  }, [sheet, mapping, unreadable, timeZone])
  const wrong = read.filter((row) => row.problems.length)
  const rows = read.flatMap((row): OpeningRow[] => (row.value ? [row.value] : []))
  const tooMany = rows.length > MAX_OPENING_ROWS
  const ready = !!sheet && !unreadable && !wrong.length && rows.length > 0 && !tooMany
  const refused = preview?.rows.filter((row) => row.problem) ?? []

  const open = async (file: File) => {
    setReading(true)
    setPreview(null)
    try {
      setSheet(await readSheet(file))
      setClientKey(uuid())
    } catch {
      setSheet(null)
      toast.error(t('import.unreadable'))
    } finally {
      setReading(false)
    }
  }

  const send = useMutation({
    mutationFn: (dryRun: boolean) =>
      api.post<OpeningImportResult>('/customer-payments/opening/import', { clientKey, rows, dryRun }),
    onSuccess: (result) => {
      if (!result.done) {
        setPreview(result)
        return
      }
      for (const key of ['customers', 'customer-payments']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('customers.openingsDone', { count: result.rows.length }))
      onClose()
    },
  })

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={t('customers.openingsImport')}
      description={t('customers.openingsHint')}
      footer={
        <>
          <Button className="mr-auto" onClick={() => void downloadOpeningTemplate()}>
            <Download />
            {t('import.template')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {preview && !refused.length ? (
            <Button variant="primary" onClick={() => send.mutate(false)} loading={send.isPending}>
              {t('customers.openingsConfirm', { count: preview.rows.length })}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => send.mutate(true)} loading={send.isPending} disabled={!ready}>
              {t('import.check')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
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
              {sheet ? t('customers.openingsFound', { count: rows.length + wrong.length }) : t('import.chooseHint')}
            </span>
          </span>
          {sheet ? <span className="text-xs text-accent-ink">{t('import.another')}</span> : null}
        </button>

        {sheet && !unreadable ? (
          // Which of the sheet's columns were taken for what: a column called otherwise is not read.
          <p data-opening-columns className="text-xs text-ink-3">
            {t('customers.openingsColumns')}:{' '}
            {OPENING_FIELDS.filter((field) => mapping[field.key] !== undefined)
              .map((field) => field.title)
              .join(', ')}
          </p>
        ) : null}

        {unreadable || (sheet && !read.length) || tooMany ? (
          <p data-opening-problem className="flex items-start gap-2 text-[13px] text-bad">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {unreadable ?? (tooMany ? t('import.tooMany', { max: MAX_OPENING_ROWS }) : t('customers.openingsEmpty'))}
          </p>
        ) : null}

        {wrong.length || refused.length ? (
          <div data-opening-problem className="rounded-lg border border-bad/40 bg-bad-soft/40 p-3 text-[13px]">
            <p className="flex items-center gap-2 font-medium text-bad">
              <TriangleAlert className="size-4" />
              {t('customers.openingsProblems', { count: wrong.length + refused.length })}
            </p>
            <ul className="mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-ink-2">
              {wrong.map((row) => (
                <li key={row.row}>
                  <span className="tabular text-ink-3">{t('import.row', { row: row.row })}</span>{' '}
                  {row.problems.join('; ')}
                </li>
              ))}
              {refused.map((row, index) => (
                <li key={`r${index}`}>
                  <span className="tabular text-ink-3">{t('import.row', { row: row.row })}</span> {row.problem}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-ink-3">{t('customers.openingsFix')}</p>
          </div>
        ) : null}

        {preview && !refused.length ? (
          <div data-opening-preview className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span className="flex items-center gap-1.5 font-medium text-ok">
                <CircleCheck className="size-4" />
                {t('customers.openingsRows', { count: preview.rows.length, created: preview.created })}
              </span>
              {preview.totals.map((sum) => (
                <span key={sum.currency} className="text-ink-2">
                  {[
                    sum.owes ? `${t('customers.openingsOwes')}: ${money(sum.owes, sum.currency)}` : '',
                    sum.owed ? `${t('customers.openingsOwed')}: ${money(sum.owed, sum.currency)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ))}
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface text-left text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
                  <tr>
                    <th className="px-2 py-1.5">{t('customers.openingsRow')}</th>
                    <th className="px-2 py-1.5">{t('customers.name')}</th>
                    <th className="px-2 py-1.5 text-right">{t('payments.opening')}</th>
                    <th className="px-2 py-1.5 text-right">{t('customers.openingsAfter')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index} className="border-t border-line">
                      <td className="tabular px-2 py-1.5 text-ink-3">{row.row}</td>
                      <td className="px-2 py-1.5">
                        {row.customerName}{' '}
                        {row.created ? <Badge tone="info">{t('customers.openingsNew')}</Badge> : null}
                        {row.again ? (
                          <span className="block text-xs text-warn">{t('customers.openingsAgain')}</span>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          'tabular px-2 py-1.5 text-right whitespace-nowrap',
                          row.change > 0 ? 'text-bad' : 'text-ok',
                        )}
                      >
                        {row.currency ? balanceText(row.change, row.currency) : ''}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {row.currency && row.balance !== null ? (
                          <Balance balance={row.balance} currency={row.currency} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
