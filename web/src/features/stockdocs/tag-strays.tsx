import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

/** An RFID tag read on a document that was not counted: a sold piece, or a tag the system does not know. */
export interface TagStray {
  epc: string
  kind: 'sold' | 'unknown'
  /** The model and variant, for a sold piece. */
  name: string | null
}

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
  const sold = strays.filter((stray) => stray.kind === 'sold')
  const unknown = strays.length - sold.length
  return (
    <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="flex-1">
          {[
            sold.length ? t('stockdocs.strays.sold', { count: sold.length }) : null,
            unknown ? t('stockdocs.strays.unknown', { count: unknown }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul className="mt-2 space-y-1 text-xs">
          {strays.map((stray) => (
            <li key={stray.epc} className="flex gap-2">
              <span className="font-mono">#{stray.epc.slice(-6)}</span>
              <span>
                {stray.kind === 'sold'
                  ? `${t('stockdocs.strays.soldOne')}: ${stray.name}`
                  : t('stockdocs.strays.unknownOne')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
