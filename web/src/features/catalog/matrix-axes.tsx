import type { MatrixAxis } from '@/components/ui/qty-matrix'
import { ColorDot } from '@/components/ui/combobox'
import type { ProductMatrix } from '@/features/receipts/receipt-state'

/** The row and column headings of a model's grid: each value by name, a colour with its dot. */
export function matrixAxes(matrix: ProductMatrix): { rows: MatrixAxis[]; columns: MatrixAxis[] } {
  return {
    rows: matrix.rows.map((row) => ({
      key: row.key,
      label: (
        <span className="flex items-center gap-1.5">
          {row.values.map((value) => (
            <span key={value.id} className="flex items-center gap-1.5">
              {value.hex ? <ColorDot color={value.hex} /> : null}
              {value.name}
            </span>
          ))}
        </span>
      ),
    })),
    columns: matrix.columns.map((value) => ({
      key: value.id,
      label: (
        <span className="inline-flex items-center gap-1">
          {value.hex ? <ColorDot color={value.hex} /> : null}
          {value.name}
        </span>
      ),
    })),
  }
}
