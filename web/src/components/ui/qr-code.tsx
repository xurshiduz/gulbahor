import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

import { cn } from '@/lib/cn'

interface QrCodeProps {
  /** What the code holds: a link, usually. */
  value: string
  /** Its side on the screen, in pixels. */
  size?: number
  /** What it is, for a reader of the screen. */
  label?: string
  className?: string
}

/** The clear margin a scanner needs around a code, in its own squares. */
const QUIET = 4

/**
 * A QR code, drawn as one path. Always dark on white, whatever the theme: a telephone's camera reads it that way
 * round, and less surely the other.
 */
export function QrCode({ value, size = 220, label, className }: QrCodeProps) {
  const { count, path } = useMemo(() => {
    const code = qrcode(0, 'M')
    code.addData(value)
    code.make()
    const side = code.getModuleCount()
    let drawn = ''
    for (let row = 0; row < side; row++) {
      for (let column = 0; column < side; column++) {
        if (code.isDark(row, column)) {
          drawn += `M${column} ${row}h1v1h-1z`
        }
      }
    }
    return { count: side, path: drawn }
  }, [value])
  const whole = count + QUIET * 2
  return (
    <svg
      role="img"
      aria-label={label}
      data-qr={value}
      width={size}
      height={size}
      viewBox={`${-QUIET} ${-QUIET} ${whole} ${whole}`}
      shapeRendering="crispEdges"
      className={cn('rounded-md', className)}
    >
      <rect x={-QUIET} y={-QUIET} width={whole} height={whole} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
