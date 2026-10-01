import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'

export interface MatrixAxis {
  key: string
  label: ReactNode
}

interface QtyMatrixProps {
  rows: MatrixAxis[]
  columns: MatrixAxis[]
  /** What a cell stands for (a variant, say); null where that combination does not exist. */
  cellKey: (row: number, column: number) => string | null
  values: Record<string, number | null>
  /** Several cells change at once on a paste or a fill. */
  onChange: (changes: Record<string, number | null>) => void
  /** 0 for goods counted in pieces. */
  decimals?: number
  disabled?: boolean
  /** Shown above the first column. */
  corner?: ReactNode
  className?: string
}

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * Quantities by colour and size, typed the way a spreadsheet is: arrows and
 * Enter move between cells, a block copied from Excel pastes in, Alt+→ and
 * Alt+↓ repeat a number along the row or down the column, and the totals
 * keep up as you type.
 */
export function QtyMatrix({
  rows,
  columns,
  cellKey,
  values,
  onChange,
  decimals = 0,
  disabled,
  corner,
  className,
}: QtyMatrixProps) {
  const tableRef = useRef<HTMLTableElement>(null)

  const focus = (row: number, column: number) =>
    tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}:${column}"]`)?.focus()

  /** The next cell that exists in a direction, skipping the gaps. */
  const step = (row: number, column: number, down: number, right: number): [number, number] | null => {
    let r = row + down
    let c = column + right
    while (r >= 0 && r < rows.length && c >= 0 && c < columns.length) {
      if (cellKey(r, c)) {
        return [r, c]
      }
      r += down
      c += right
    }
    return null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    const input = event.currentTarget
    const go = (down: number, right: number) => {
      const next = step(row, column, down, right)
      if (next) {
        event.preventDefault()
        focus(...next)
      }
      return !!next
    }

    if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) {
      // Repeat this cell's number to the end of its row or column.
      event.preventDefault()
      const value = values[cellKey(row, column) as string] ?? null
      const changes: Record<string, number | null> = {}
      const along = event.key === 'ArrowRight' ? columns.length : rows.length
      for (let index = (event.key === 'ArrowRight' ? column : row) + 1; index < along; index++) {
        const key = event.key === 'ArrowRight' ? cellKey(row, index) : cellKey(index, column)
        if (key) {
          changes[key] = value
        }
      }
      onChange(changes)
      return
    }
    switch (event.key) {
      case 'ArrowUp':
        go(-1, 0)
        break
      case 'ArrowDown':
        go(1, 0)
        break
      case 'ArrowLeft':
        if (input.selectionStart === 0 && input.selectionEnd === 0) go(0, -1)
        break
      case 'ArrowRight':
        if (input.selectionStart === input.value.length) go(0, 1)
        break
      case 'Enter':
        if (event.ctrlKey || event.metaKey) {
          break
        }
        // Down the column, then on to the top of the next one; from the last cell the form takes over.
        if (!go(1, 0)) {
          for (let c = column + 1; c < columns.length; c++) {
            const top = rows.findIndex((_row, r) => cellKey(r, c))
            if (top !== -1) {
              event.preventDefault()
              focus(top, c)
              break
            }
          }
        }
        break
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, row: number, column: number) => {
    const text = event.clipboardData.getData('text')
    if (!/[\t\n]/.test(text.trim())) {
      return
    }
    event.preventDefault()
    const changes: Record<string, number | null> = {}
    text
      .replace(/\r/g, '')
      .replace(/\n$/, '')
      .split('\n')
      .forEach((line, down) => {
        line.split('\t').forEach((cell, right) => {
          const key =
            row + down < rows.length && column + right < columns.length ? cellKey(row + down, column + right) : null
          if (key) {
            const value = Number(cell.replace(/\s/g, '').replace(',', '.'))
            changes[key] = cell.trim() && Number.isFinite(value) && value >= 0 ? round(value) : null
          }
        })
      })
    onChange(changes)
  }

  const sum = (keys: (string | null)[]) => round(keys.reduce((total, key) => total + ((key && values[key]) || 0), 0))
  const rowTotal = (row: number) => sum(columns.map((_column, column) => cellKey(row, column)))
  const columnTotal = (column: number) => sum(rows.map((_row, row) => cellKey(row, column)))
  const total = round(rows.reduce((all, _row, row) => all + rowTotal(row), 0))

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table ref={tableRef} className="border-separate border-spacing-0.5 text-[13px]">
        <thead>
          <tr>
            <th className="pr-2 text-left text-xs font-medium text-ink-3">{corner}</th>
            {columns.map((column) => (
              <th key={column.key} className="min-w-14 px-1 text-center text-xs font-medium text-ink-2">
                {column.label}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.key}>
              <th className="pr-2 text-left text-xs font-medium whitespace-nowrap text-ink-2">{row.label}</th>
              {columns.map((column, c) => {
                const key = cellKey(r, c)
                return (
                  <td key={column.key}>
                    {key ? (
                      <Cell
                        value={values[key] ?? null}
                        decimals={decimals}
                        disabled={disabled}
                        position={`${r}:${c}`}
                        onChange={(value) => onChange({ [key]: value })}
                        onKeyDown={(event) => handleKeyDown(event, r, c)}
                        onPaste={(event) => handlePaste(event, r, c)}
                      />
                    ) : (
                      <div className="h-8 w-14 rounded-md border border-dashed border-line" />
                    )}
                  </td>
                )
              })}
              <td className="tabular pl-2 text-right text-xs text-ink-3">
                {rowTotal(r) ? formatNumber(rowTotal(r)) : ''}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 || columns.length > 1 ? (
          <tfoot>
            <tr>
              <td />
              {columns.map((column, c) => (
                <td key={column.key} className="tabular pt-0.5 text-center text-xs text-ink-3">
                  {columnTotal(c) ? formatNumber(columnTotal(c)) : ''}
                </td>
              ))}
              <td className="tabular pl-2 text-right text-xs font-semibold text-ink">{formatNumber(total)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

interface CellProps {
  value: number | null
  decimals: number
  disabled?: boolean
  position: string
  onChange: (value: number | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void
}

const show = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

/** The number a cell's text stands for; nothing and zero both mean "none". */
function read(text: string): number | null {
  const value = text ? Number(text.replace(',', '.')) : 0
  return Number.isFinite(value) && value > 0 ? value : null
}

function Cell({ value, decimals, disabled, position, onChange, onKeyDown, onPaste }: CellProps) {
  const [text, setText] = useState(() => show(value))

  // What is being typed stays as typed ("1,"); a value set from outside (a paste, a fill) replaces it.
  useEffect(() => {
    setText((current) => (read(current) === value ? current : show(value)))
  }, [value])

  const pattern = decimals ? new RegExp(`^\\d{0,7}([.,]\\d{0,${decimals}})?$`) : /^\d{0,7}$/

  return (
    <input
      data-cell={position}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      disabled={disabled}
      value={text}
      onChange={(event) => {
        const next = event.target.value.trim()
        if (!pattern.test(next)) {
          return
        }
        setText(next)
        onChange(read(next))
      }}
      onFocus={(event) => event.target.select()}
      onBlur={() => setText(show(value))}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={cn(
        'tabular h-8 w-14 rounded-md border border-line-strong bg-surface text-center text-[13px] text-ink transition-colors',
        'hover:border-control focus:border-accent focus:outline-2 focus:outline-accent/25',
        'disabled:border-line disabled:bg-sunken disabled:text-ink-2',
        value ? 'font-medium' : 'text-ink-3',
      )}
    />
  )
}
