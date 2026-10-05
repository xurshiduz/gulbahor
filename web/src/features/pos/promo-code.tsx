import { useMutation } from '@tanstack/react-query'
import { TicketPercent, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

interface PromoCodeProps {
  registerId: string
  /** The code the cart is being sold with, already known to mean something. */
  value: string | null
  onChange: (code: string | null) => void
}

/**
 * The word a customer says to get a promotion that asks for one. The till
 * is told at once whether it means anything here today: a word that opens
 * nothing is not kept, so the sale is never refused for it later.
 */
export function PromoCode({ registerId, value, onChange }: PromoCodeProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  const check = useMutation({
    mutationFn: (code: string) => api.get<{ name: string }[]>('/pos/promo-code', { registerId, code }),
    meta: { silent: true },
    onSuccess: (opened, code) => {
      if (!opened.length) {
        toast.error(t('pos.promoCodeUnknown'))
        return
      }
      toast.success(t('pos.promoCodeTaken', { name: opened.map((promotion) => promotion.name).join(', ') }))
      setText('')
      onChange(code.trim().toUpperCase())
    },
    onError: (error) => toast.error(String(error instanceof Error ? error.message : error)),
  })

  if (value) {
    return (
      <div className="mb-2 flex items-center justify-between gap-3 text-[13px]">
        <span className="flex items-center gap-1.5 text-ink-3">
          <TicketPercent className="size-4" />
          {t('pos.promoCode')}
        </span>
        <span className="flex items-center gap-1">
          <span className="font-code font-medium text-accent-ink">{value}</span>
          <Button
            variant="ghost"
            size="iconSm"
            tabIndex={-1}
            aria-label={t('pos.promoCodeClear')}
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </span>
      </div>
    )
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-3 text-[13px] text-ink-3">
      <span className="flex items-center gap-1.5">
        <TicketPercent className="size-4" />
        {t('pos.promoCode')}
      </span>
      <Input
        value={text}
        maxLength={30}
        autoComplete="off"
        spellCheck={false}
        aria-label={t('pos.promoCode')}
        disabled={check.isPending}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && text.trim()) {
            event.preventDefault()
            event.stopPropagation()
            check.mutate(text)
          }
        }}
        onBlur={() => (text.trim() ? check.mutate(text) : undefined)}
        className="font-code h-8 w-36 text-right uppercase"
      />
    </div>
  )
}
