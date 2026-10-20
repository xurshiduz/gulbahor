import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

/**
 * What a document's reader saw but did not count: a sold piece, a tag the system does not know, goods not on a
 * transfer being received or more of them than were sent — and a piece read as it was sent but not as it came.
 */
export interface TagStray {
  /** The RFID tag; a barcode, for goods read by one. */
  epc: string
  kind: 'sold' | 'unknown' | 'foreign' | 'extra' | 'missing'
  /** The model and variant, where it is known. */
  name: string | null
}

const KINDS: TagStray['kind'][] = ['missing', 'sold', 'foreign', 'extra', 'unknown']

/**
 * What the reader saw but the count left out, as one quiet line: a handheld's
 * screen is small, and an alert for every stray tag would cover the page.
 */
export function TagStrays({ strays }: { strays: TagStray[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!strays.length) {
    return null
  }
  const counts = KINDS.map((kind) => [kind, strays.filter((stray) => stray.kind === kind).length] as const)
  return (
    <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="flex-1">
          {counts
            .filter(([, count]) => count)
            .map(([kind, count]) => t(`stockdocs.strays.${kind}`, { count }))
            .join(' · ')}
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul className="mt-2 space-y-1 text-xs">
          {strays.map((stray) => (
            <li key={stray.epc} className="flex gap-2">
              <span className="font-mono">
                {/^[0-9A-F]{24}$/.test(stray.epc) ? `#${stray.epc.slice(-6)}` : stray.epc.split(':')[0]}
              </span>
              <span>
                {t(`stockdocs.strays.${stray.kind}One`)}
                {stray.name ? `: ${stray.name}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
