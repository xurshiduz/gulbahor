import { Check, Copy } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'

/**
 * A code people copy all day (an article, a barcode): a click on it copies it, and a tick says so for a moment.
 * The click stays its own — it does not open the row it sits in.
 */
export function CopyText({ text, className }: { text: string; className?: string }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)

  const copy = async (event: MouseEvent) => {
    event.stopPropagation()
    try {
      await copyText(text)
      setDone(true)
      window.setTimeout(() => setDone(false), 1200)
    } catch {
      toast.error(t('common.copyFailed'))
    }
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      data-copy={text}
      title={t('common.copyHint')}
      onClick={(event) => void copy(event)}
      className={cn(
        // Never cut short: a code half shown is a code that cannot be read off or checked.
        'group/copy font-code -mx-1 inline-flex shrink-0 items-center gap-1 rounded px-1 text-left whitespace-nowrap transition-colors',
        'hover:bg-accent-soft hover:text-accent-ink',
        done && 'bg-ok-soft text-ok hover:bg-ok-soft hover:text-ok',
        className,
      )}
    >
      <span>{text}</span>
      {done ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-70" />
      )}
    </button>
  )
}
