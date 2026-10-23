import { cn } from '@/lib/cn'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

const SIZES = { sm: 'size-6 text-[11px]', md: 'size-8 text-xs', lg: 'size-20 text-2xl' } as const

/** A person: their own picture where they made one, their initials where not. */
export function Avatar({
  name,
  src,
  size = 'sm',
  className,
}: {
  name: string
  src: string | null | undefined
  size?: keyof typeof SIZES
  className?: string
}) {
  return src ? (
    <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-ink',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
