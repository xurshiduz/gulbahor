import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Columns3,
  FileSpreadsheet,
  Inbox,
} from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@/lib/cn'
import { MAX_EXPORT_ROWS, saveExcel, type ExportCell, type ExportColumn, type ExportValue } from '@/lib/excel'
import { formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { usePreference } from '@/lib/preferences'

import { Button } from './button'
import { Checkbox, Select } from './controls'
import { EmptyState, Skeleton, Tooltip } from './feedback'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Name in the column chooser; defaults to the header when that is text. */
    label?: string
    /** Server-side sort key. Columns without one cannot be sorted. */
    sortKey?: string
    className?: string
    headerClassName?: string
    /** Always shown; left out of the column chooser. */
    fixed?: boolean
    /** What the column holds as a plain value, for a spreadsheet. A column without it is left out of an export. */
    export?: (row: TData) => ExportValue | ExportCell
    /** Not shown on the screen: a column of the spreadsheet only, for what the screen folds into another column. */
    exportOnly?: boolean
  }
}

export const PAGE_SIZES = [20, 50, 100, 200]

export interface TablePagination {
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
  onSizeChange: (size: number) => void
}

interface ColumnPreference {
  hidden: string[]
  order: string[]
}

interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  data: T[] | undefined
  loading?: boolean
  rowId: (row: T) => string
  /** Enter or a click on a row. */
  onRowOpen?: (row: T) => void
  sort?: string
  order?: 'asc' | 'desc'
  onSortChange?: (sort: string, order: 'asc' | 'desc') => void
  pagination?: TablePagination
  /** Remembers this person's columns under this name. */
  preferenceKey?: string
  /** Filters and search, shown above the table on the left. */
  toolbar?: ReactNode
  empty?: ReactNode
  rowClassName?: (row: T) => string | undefined
  /**
   * Lets the list be saved as a spreadsheet: `rows` gives every row the
   * filters cover, not only the page on the screen. The file has the columns
   * that are shown, in the order they are shown.
   */
  exportAs?: { fileName: string; rows: () => Promise<T[]> }
}

/**
 * The list every screen uses. Paging and sorting happen on the server; the
 * columns a person hides or reorders stay that way on all their devices.
 * With the table focused, ↑↓ move between rows, Enter opens one, and
 * PageUp/PageDown turn the page.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  rowId,
  onRowOpen,
  sort,
  order,
  onSortChange,
  pagination,
  preferenceKey,
  toolbar,
  empty,
  rowClassName,
  exportAs,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  const rows = useMemo(() => data ?? [], [data])

  const [preference, setPreference] = usePreference<ColumnPreference>(preferenceKey ? `table.${preferenceKey}` : null, {
    hidden: [],
    order: [],
  })

  const columnIds = columns.map((column) => column.id as string)
  const ordered = useMemo(() => {
    const result = preference.order.filter((id) => columnIds.includes(id))
    // A column the saved order does not know goes next to the one it is defined after, not to the far end.
    columnIds.forEach((id, index) => {
      if (!result.includes(id)) {
        const before = columnIds
          .slice(0, index)
          .reverse()
          .find((previous) => result.includes(previous))
        result.splice(before ? result.indexOf(before) + 1 : 0, 0, id)
      }
    })
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference.order, columnIds.join('|')])

  const shown = useMemo(() => columns.filter((column) => !column.meta?.exportOnly), [columns])

  const table = useReactTable({
    data: rows,
    columns: shown,
    getCoreRowModel: getCoreRowModel(),
    getRowId: rowId,
    manualSorting: true,
    manualPagination: true,
    state: {
      columnOrder: ordered,
      columnVisibility: Object.fromEntries(preference.hidden.map((id) => [id, false])),
    },
  })

  useEffect(() => {
    setActive((current) => Math.min(current, rows.length - 1))
  }, [rows.length])

  useEffect(() => {
    bodyRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // ↓ pressed while nothing has the focus brings the keyboard into the list.
  useHotkey(
    'arrowdown',
    () => {
      if (document.activeElement !== document.body) {
        return false
      }
      scrollRef.current?.focus()
      setActive((current) => (current < 0 ? 0 : current))
    },
    { enabled: rows.length > 0 },
  )

  const pages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.size)) : 1

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((current) => Math.min(rows.length - 1, current + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((current) => Math.max(0, current - 1))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(rows.length - 1)
        break
      case 'Enter':
        if (rows[active] && onRowOpen) {
          event.preventDefault()
          onRowOpen(rows[active])
        }
        break
      case 'PageDown':
        if (pagination && pagination.page < pages) {
          event.preventDefault()
          pagination.onPageChange(pagination.page + 1)
          setActive(0)
        }
        break
      case 'PageUp':
        if (pagination && pagination.page > 1) {
          event.preventDefault()
          pagination.onPageChange(pagination.page - 1)
          setActive(0)
        }
        break
    }
  }

  const isEmpty = !loading && rows.length === 0
  const visibleCount = table.getVisibleLeafColumns().length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {toolbar || preferenceKey || exportAs ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {exportAs ? (
            <ExportButton
              fileName={exportAs.fileName}
              rows={exportAs.rows}
              columns={ordered.flatMap((id) => {
                const column = columns.find((item) => item.id === id)
                const meta = column?.meta
                return column && meta?.export && !preference.hidden.includes(id)
                  ? [
                      {
                        title: meta.label ?? (typeof column.header === 'string' ? column.header : id),
                        value: meta.export,
                      },
                    ]
                  : []
              })}
            />
          ) : null}
          {preferenceKey ? (
            <ColumnChooser
              columns={shown}
              order={ordered}
              hidden={preference.hidden}
              onChange={(next) => setPreference(next)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <div
          ref={scrollRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onFocus={(event) =>
            event.target === event.currentTarget && setActive((current) => (current < 0 && rows.length ? 0 : current))
          }
          className="min-h-0 flex-1 overflow-auto outline-none focus-visible:[&_tr[data-active=true]]:outline-accent"
        >
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta
                    const isSorted = meta?.sortKey && sort === meta.sortKey
                    const label = flexRender(header.column.columnDef.header, header.getContext())
                    return (
                      <th
                        key={header.id}
                        aria-sort={isSorted ? (order === 'desc' ? 'descending' : 'ascending') : undefined}
                        className={cn(
                          'h-8.5 border-b border-line bg-sunken px-3 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-ink-3 uppercase',
                          meta?.headerClassName,
                        )}
                      >
                        {meta?.sortKey && onSortChange ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() =>
                              onSortChange(meta.sortKey as string, isSorted && order === 'asc' ? 'desc' : 'asc')
                            }
                            className="inline-flex items-center gap-1 uppercase hover:text-ink"
                          >
                            {label}
                            {isSorted ? (
                              order === 'desc' ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ArrowUp className="size-3" />
                              )
                            ) : null}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody ref={bodyRef}>
              {loading && !rows.length
                ? Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      {Array.from({ length: visibleCount }, (_cell, cell) => (
                        <td key={cell} className="border-b border-line px-3 py-2.5">
                          <Skeleton className="h-3.5 w-full max-w-36" />
                        </td>
                      ))}
                    </tr>
                  ))
                : table.getRowModel().rows.map((row, index) => (
                    <tr
                      key={row.id}
                      data-active={index === active}
                      onClick={() => {
                        setActive(index)
                        onRowOpen?.(row.original)
                      }}
                      className={cn(
                        'outline-2 -outline-offset-2 outline-transparent transition-colors',
                        onRowOpen && 'cursor-pointer hover:bg-canvas',
                        index === active && 'bg-accent-soft/60 hover:bg-accent-soft/60',
                        loading && 'opacity-60',
                        rowClassName?.(row.original),
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            'border-b border-line px-3 py-2 align-middle',
                            cell.column.columnDef.meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
          {isEmpty ? (empty ?? <EmptyState icon={Inbox} title={t('common.nothingFound')} />) : null}
        </div>
        {pagination ? <Pagination {...pagination} pages={pages} /> : null}
      </div>
    </div>
  )
}

function Pagination({ page, size, total, pages, onPageChange, onSizeChange }: TablePagination & { pages: number }) {
  const { t } = useTranslation()
  const current = Math.min(page, pages)
  const from = total === 0 ? 0 : (current - 1) * size + 1
  const to = Math.min(total, current * size)

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-3 py-1.5 text-xs text-ink-3">
      <div className="flex items-center gap-3">
        <span className="tabular">
          {t('table.range', { from: formatNumber(from), to: formatNumber(to), total: formatNumber(total) })}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline">{t('table.perPage')}</span>
          <Select
            value={String(size)}
            onChange={(value) => onSizeChange(Number(value))}
            options={PAGE_SIZES.map((option) => ({ value: String(option), label: String(option) }))}
            className="h-7 w-18 text-xs"
          />
        </div>
      </div>
      <nav className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="iconSm"
          disabled={current <= 1}
          onClick={() => onPageChange(1)}
          aria-label={t('table.first')}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
          aria-label={t('table.prev')}
        >
          <ChevronLeft />
        </Button>
        <span className="tabular px-2 font-medium text-ink-2">
          {formatNumber(current)} / {formatNumber(pages)}
        </span>
        <Button
          variant="ghost"
          size="iconSm"
          disabled={current >= pages}
          onClick={() => onPageChange(current + 1)}
          aria-label={t('table.next')}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          disabled={current >= pages}
          onClick={() => onPageChange(pages)}
          aria-label={t('table.last')}
        >
          <ChevronsRight />
        </Button>
      </nav>
    </div>
  )
}

function ExportButton<T>({
  fileName,
  rows,
  columns,
}: {
  fileName: string
  rows: () => Promise<T[]>
  columns: ExportColumn<T>[]
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const all = await rows()
      if (!all.length) {
        toast.error(t('table.exportEmpty'))
        return
      }
      await saveExcel(fileName, columns, all)
      if (all.length >= MAX_EXPORT_ROWS) {
        toast.warning(t('table.exportCut', { count: all.length }))
      } else {
        toast.success(t('table.exported', { count: all.length }))
      }
    } catch {
      toast.error(t('table.exportFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tooltip content={t('table.export')}>
      <Button size="icon" loading={busy} onClick={() => void save()} aria-label={t('table.export')}>
        <FileSpreadsheet />
      </Button>
    </Tooltip>
  )
}

function ColumnChooser<T>({
  columns,
  order,
  hidden,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  order: string[]
  hidden: string[]
  onChange: (preference: ColumnPreference) => void
}) {
  const { t } = useTranslation()
  const byId = new Map(columns.map((column) => [column.id as string, column]))
  const choosable = order.filter((id) => byId.has(id) && !byId.get(id)?.meta?.fixed)

  const labelOf = (id: string) => {
    const column = byId.get(id)
    return column?.meta?.label ?? (typeof column?.header === 'string' ? column.header : id)
  }

  const move = (id: string, delta: number) => {
    const index = order.indexOf(id)
    const target = index + delta
    if (target < 0 || target >= order.length) {
      return
    }
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ hidden, order: next })
  }

  return (
    <Popover.Root>
      <Tooltip content={t('common.columns')}>
        <Popover.Trigger asChild>
          <Button size="icon" aria-label={t('common.columns')}>
            <Columns3 />
          </Button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-lg border border-line bg-surface p-2 shadow-float data-[state=open]:animate-pop-in"
        >
          <p className="eyebrow px-1.5 pb-1.5">{t('common.columns')}</p>
          <div className="flex flex-col">
            {choosable.map((id) => (
              <div key={id} className="flex h-8 items-center gap-1 rounded-md px-1.5 hover:bg-sunken">
                <Checkbox
                  checked={!hidden.includes(id)}
                  onChange={(checked) =>
                    onChange({ order, hidden: checked ? hidden.filter((item) => item !== id) : [...hidden, id] })
                  }
                  label={labelOf(id)}
                  className="min-w-0 flex-1"
                />
                <Button variant="ghost" size="iconSm" className="size-6" onClick={() => move(id, -1)} aria-label="↑">
                  <ChevronUp />
                </Button>
                <Button variant="ghost" size="iconSm" className="size-6" onClick={() => move(id, 1)} aria-label="↓">
                  <ChevronDown />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 border-t border-line pt-1.5">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange({ hidden: [], order: [] })}>
              {t('common.resetColumns')}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
