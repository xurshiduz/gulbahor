import type { ImageThumb } from '@erp/core'
import { Image as ImageIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/cn'

interface ThumbProps {
  image: ImageThumb | null | undefined
  /** Its size and shape: `size-9`, `size-28`… */
  className?: string
  alt?: string
}

/**
 * A photograph in its place. The blur that came with the list stands there
 * at once, so nothing jumps; the photograph is fetched when it nears the
 * screen and fades in over it. With no photograph, a quiet mark.
 */
export function Thumb({ image, className, alt = '' }: ThumbProps) {
  const [shown, setShown] = useState(false)
  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-md bg-sunken', className)}
      style={
        image
          ? { backgroundImage: `url(${image.blur})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      {image ? (
        <img
          src={image.url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setShown(true)}
          className={cn('size-full object-cover transition-opacity duration-200', shown ? 'opacity-100' : 'opacity-0')}
        />
      ) : (
        <ImageIcon className="absolute inset-0 m-auto size-2/5 text-ink-3/40" />
      )}
    </span>
  )
}
