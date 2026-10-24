import {
  barRuns,
  code128,
  ean13,
  labelTextWidth,
  layoutDesign,
  type DesignBars,
  type DesignText,
  type LabelDesign,
  type LabelElement,
  type LabelValues,
  SAMPLE_LABEL_VALUES,
} from '@erp/core'
import { useRef, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { wrapLabelText } from './label-preview'

const NAMED = [
  'name',
  'brand',
  'category',
  'color',
  'size',
  'season',
  'gender',
  'country',
  'collection',
  'material',
  'manufacturer',
] as const

/**
 * What the designer shows in place of goods: each word field by its own name, in the viewer's language, so the
 * label reads the same for any business; numbers (price, code, date) keep the neutral samples.
 */
export function useSampleValues(): LabelValues {
  const { t } = useTranslation()
  const named = Object.fromEntries(NAMED.map((field) => [field, t(`labelDesign.fields.${field}`)]))
  return { ...SAMPLE_LABEL_VALUES, ...named, details: `${named.color} · ${named.size}` }
}

const DOTS_PER_MM = 8
/** Moved and resized by half millimetres: close enough to place by eye, coarse enough to line things up. */
const SNAP = 0.5
const snap = (mm: number) => Math.round(mm / SNAP) * SNAP

function Text({ item }: { item: DesignText }) {
  const rows = wrapLabelText(item.text, item.font, item.width, item.lines)
  const anchor = item.align === 'R' ? 'end' : item.align === 'C' ? 'middle' : 'start'
  const x = item.align === 'R' ? item.x + item.width : item.align === 'C' ? item.x + item.width / 2 : item.x
  return (
    <>
      {rows.map((row, index) => {
        const length = Math.min(labelTextWidth(row, item.font), item.width)
        const top = item.y + item.font * index
        return (
          <g key={index}>
            <text
              x={x}
              // The printer places a line by its top; a browser, by the line the letters stand on.
              y={top + item.font * 0.8}
              fontSize={item.font}
              fontWeight={item.bold ? 800 : 600}
              textAnchor={anchor}
              // As long as the printer's own narrow font will set it, whatever font the screen has.
              textLength={length}
              lengthAdjust="spacingAndGlyphs"
            >
              {row}
            </text>
            {item.underline && index === 0 ? (
              <rect x={item.x} y={item.y + item.font} width={item.width} height={2} />
            ) : null}
          </g>
        )
      })}
    </>
  )
}

function Bars({ item }: { item: DesignBars }) {
  const modules = item.ean ? ean13(item.code) : code128(item.code)
  if (!modules) {
    return null
  }
  const left = item.x + (item.ean ? 11 * item.module : 0)
  // The size set on the element, the same the printer is told.
  const digits = item.digitFont
  return (
    <>
      {barRuns(modules).map((bar) => (
        <rect
          key={bar.at}
          x={left + bar.at * item.module}
          y={item.y}
          width={bar.width * item.module}
          height={item.height}
        />
      ))}
      {item.digits ? (
        <text
          x={left + (modules.length * item.module) / 2}
          y={item.y + item.height + digits}
          fontSize={digits}
          textAnchor="middle"
          fontWeight={600}
        >
          {item.code}
        </text>
      ) : null}
    </>
  )
}

interface DesignViewProps {
  design: LabelDesign
  values: LabelValues
  /** Screen pixels to a dot of a 203 dpi head. */
  scale: number
  /** Where the designer is: the boxes show, and can be picked, moved and resized. */
  selected?: string | null
  onSelect?: (id: string | null) => void
  onMove?: (id: string, patch: Pick<LabelElement, 'x' | 'y' | 'w' | 'h'>) => void
}

/**
 * A label of a design as it will print, drawn from the same layout the printer is sent. In the designer each
 * element's box is drawn over it: pressed it is picked, dragged it moves, its corner resizes it.
 */
export function DesignView({ design, values, scale, selected = null, onSelect, onMove }: DesignViewProps) {
  const layout = layoutDesign(design, values, 203)
  const drag = useRef<{
    id: string
    mode: 'move' | 'size'
    x: number
    y: number
    start: Pick<LabelElement, 'x' | 'y' | 'w' | 'h'>
  } | null>(null)
  const editing = !!onMove

  const begin = (event: PointerEvent, element: LabelElement, mode: 'move' | 'size') => {
    if (!onMove) {
      return
    }
    event.stopPropagation()
    event.preventDefault()
    onSelect?.(element.id)
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    drag.current = {
      id: element.id,
      mode,
      x: event.clientX,
      y: event.clientY,
      start: { x: element.x, y: element.y, w: element.w, h: element.h },
    }
  }
  const move = (event: PointerEvent) => {
    const now = drag.current
    if (!now || !onMove) {
      return
    }
    const dx = (event.clientX - now.x) / scale / DOTS_PER_MM
    const dy = (event.clientY - now.y) / scale / DOTS_PER_MM
    const { start } = now
    if (now.mode === 'move') {
      onMove(now.id, {
        ...start,
        x: Math.min(Math.max(0, snap(start.x + dx)), Math.max(0, design.width - start.w)),
        y: Math.min(Math.max(0, snap(start.y + dy)), Math.max(0, design.height - start.h)),
      })
    } else {
      onMove(now.id, {
        ...start,
        w: Math.min(Math.max(2, snap(start.w + dx)), design.width - start.x),
        h: Math.min(Math.max(2, snap(start.h + dy)), design.height - start.y),
      })
    }
  }
  const end = () => {
    drag.current = null
  }

  const radius = 2.5 * DOTS_PER_MM
  return (
    <svg
      width={layout.width * scale}
      height={layout.height * scale}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="block touch-none select-none"
      onPointerDown={() => onSelect?.(null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{ fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif' }}
    >
      <rect width={layout.width} height={layout.height} rx={radius} fill="#fff" stroke="#d4d4d8" strokeWidth={2} />
      <g fill="#111">
        {layout.items.map((item, index) =>
          item.kind === 'text' ? (
            <Text key={index} item={item} />
          ) : item.kind === 'bars' ? (
            <Bars key={index} item={item} />
          ) : (
            <image
              key={index}
              href={item.picture.preview}
              x={item.x}
              y={item.y}
              width={item.picture.width}
              height={item.picture.height}
              preserveAspectRatio="none"
            />
          ),
        )}
      </g>
      {editing
        ? design.elements.map((element) => {
            const on = element.id === selected
            const x = element.x * DOTS_PER_MM
            const y = element.y * DOTS_PER_MM
            const w = element.w * DOTS_PER_MM
            const h = element.h * DOTS_PER_MM
            const handle = 10 / scale
            return (
              <g key={element.id}>
                <rect
                  data-box={element.id}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={on ? 'rgba(59,130,246,0.08)' : 'transparent'}
                  stroke={on ? '#3b82f6' : 'rgba(59,130,246,0.35)'}
                  strokeWidth={on ? 2 / scale : 1 / scale}
                  strokeDasharray={on ? undefined : `${4 / scale} ${3 / scale}`}
                  className="cursor-move"
                  onPointerDown={(event) => begin(event, element, 'move')}
                />
                {on ? (
                  <rect
                    data-handle={element.id}
                    x={x + w - handle / 2}
                    y={y + h - handle / 2}
                    width={handle}
                    height={handle}
                    fill="#fff"
                    stroke="#3b82f6"
                    strokeWidth={2 / scale}
                    className="cursor-nwse-resize"
                    onPointerDown={(event) => begin(event, element, 'size')}
                  />
                ) : null}
              </g>
            )
          })
        : null}
    </svg>
  )
}
