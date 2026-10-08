import {
  barRuns,
  code128,
  ean13,
  LABEL_SIZES,
  labelTextWidth,
  layoutLabel,
  type LabelBars,
  type LabelData,
  type LabelFormat,
  type LabelTemplate,
  type LabelText,
} from '@erp/core'

/** How large a millimetre of label is on screen. */
const PX_PER_MM = 6

/**
 * A boxed text as the printer breaks it: at the spaces, a word too long for
 * a line cut where the line ends, and no more lines than the box has.
 */
export function wrapLabelText(text: string, font: number, width: number, lines: number): string[] {
  const fits = (value: string) => labelTextWidth(value, font) <= width
  const rows: string[] = []
  let row = ''
  for (const word of text.split(' ')) {
    let rest = word
    const joined = row ? `${row} ${rest}` : rest
    if (fits(joined)) {
      row = joined
      continue
    }
    if (row) {
      rows.push(row)
      row = ''
    }
    while (rest && !fits(rest)) {
      let cut = rest.length - 1
      while (cut > 1 && !fits(rest.slice(0, cut))) {
        cut -= 1
      }
      rows.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    row = rest
  }
  if (row) {
    rows.push(row)
  }
  return rows.slice(0, lines)
}

function Text({ item }: { item: LabelText }) {
  const rows = item.box ? wrapLabelText(item.text, item.font, item.box.width, item.box.lines) : [item.text]
  const right = item.box?.align === 'R'
  return (
    <>
      {rows.map((row, index) => (
        <text
          key={index}
          x={right && item.box ? item.x + item.box.width : item.x}
          // The printer places a line by its top; a browser, by the line the letters stand on.
          y={item.y + item.font * index + item.font * 0.8}
          fontSize={item.font}
          textAnchor={right ? 'end' : 'start'}
          // As long as the printer's own narrow font will set it, whatever font the screen has.
          textLength={labelTextWidth(row, item.font)}
          lengthAdjust="spacingAndGlyphs"
        >
          {row}
        </text>
      ))}
    </>
  )
}

function Bars({ item }: { item: LabelBars }) {
  const modules = item.ean ? ean13(item.code) : code128(item.code)
  if (!modules) {
    return null
  }
  // The printer leaves room on the left of an EAN-13 for its first digit.
  const left = item.x + (item.ean ? 11 * item.module : 0)
  const digits = Math.round(item.module * 10)
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
      <text
        x={left + (modules.length * item.module) / 2}
        y={item.y + item.height + digits}
        fontSize={digits}
        textAnchor="middle"
        fontWeight={400}
      >
        {item.code}
      </text>
    </>
  )
}

interface LabelPreviewProps {
  label: LabelData
  format: LabelFormat
  template: LabelTemplate
}

/**
 * A label as the printer will lay it out, drawn from the same layout the
 * printer's commands are made of. The letters are the screen's, not the
 * printer's, so it shows where things go and how much room they take, not
 * the exact shape of a letter.
 */
export function LabelPreview({ label, format, template }: LabelPreviewProps) {
  const layout = layoutLabel(label, format, template)
  const size = LABEL_SIZES[format.size]
  return (
    <svg
      data-label-preview
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={size.width * PX_PER_MM}
      height={size.height * PX_PER_MM}
      className="max-w-full rounded-md bg-white shadow-card"
      fill="black"
      fontFamily="'Arial Narrow', Arial, Helvetica, sans-serif"
      fontWeight={700}
      shapeRendering="crispEdges"
    >
      {layout.items.map((item, index) =>
        item.kind === 'text' ? <Text key={index} item={item} /> : <Bars key={index} item={item} />,
      )}
    </svg>
  )
}
