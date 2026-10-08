import { MAX_PRODUCT_IMAGES, type ProductDto, type ProductImageDto } from '@gulbahor/core'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, RotateCw, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Spinner, Tooltip } from '@/components/ui/feedback'
import { Card } from '@/components/ui/page'
import { Thumb } from '@/components/ui/thumb'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { photoVersions } from '@/lib/image'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

/** A colour the model comes in: what a photograph may be said to show. */
export interface ImageColor {
  id: string
  name: string
}

/** A picture chosen and not yet kept: being made ready, on its way, or turned back. */
interface Waiting {
  key: string
  file: File
  preview: string
  state: 'waiting' | 'sending' | 'failed'
  error?: string
}

const ALL = 'all'

const said = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback)

interface ProductImagesProps {
  /** Null for a model not saved yet: it has nowhere to keep photographs. */
  productId: string | null
  images: ProductImageDto[]
  colors: ImageColor[]
  canManage: boolean
}

/**
 * A model's photographs. They are added by choosing files, dropping them
 * here or pasting one; each is made small in the browser and sent on its
 * own, so one that fails does not hold the others back. The first is the
 * model's face; dragging puts them in order. Nothing here waits for the
 * form to be saved: a photograph is kept the moment it arrives.
 */
export function ProductImages({ productId, images, colors, canManage }: ProductImagesProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<Waiting[]>([])
  const [over, setOver] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ProductImageDto | null>(null)
  const editable = canManage && !!productId

  /** The model as the screen holds it is given its photographs as they now stand. */
  const keep = (next: ProductImageDto[]) =>
    queryClient.setQueryData<ProductDto>(['products', 'one', productId], (current) =>
      current ? { ...current, images: next } : current,
    )

  const room = MAX_PRODUCT_IMAGES - images.length - queue.filter((item) => item.state !== 'failed').length
  const take = (files: Iterable<File>) => {
    const pictures = [...files].filter((file) => file.type.startsWith('image/'))
    if (!editable || !pictures.length) {
      return
    }
    if (pictures.length > room) {
      toast.error(t('products.imagesTooMany', { max: MAX_PRODUCT_IMAGES }))
    }
    setQueue((current) => [
      ...current,
      ...pictures.slice(0, Math.max(0, room)).map((file) => ({
        key: uuid(),
        file,
        preview: URL.createObjectURL(file),
        state: 'waiting' as const,
      })),
    ])
  }

  // What the listeners below call is always the latest of these.
  const latest = useRef({ take, keep, productId })
  latest.current = { take, keep, productId }

  // One at a time, in the order they were chosen: that is the order they will stand in.
  const busy = useRef(false)
  useEffect(() => {
    const next = queue.find((item) => item.state === 'waiting')
    if (!next || busy.current) {
      return
    }
    busy.current = true
    const settle = (change: (item: Waiting) => Waiting | null) =>
      setQueue((current) =>
        current.flatMap((item) => {
          const changed = item.key === next.key ? change(item) : item
          return changed ? [changed] : []
        }),
      )
    settle((item) => ({ ...item, state: 'sending' }))
    void (async () => {
      try {
        const versions = await photoVersions(next.file)
        latest.current.keep(await api.post<ProductImageDto[]>(`/products/${latest.current.productId}/images`, versions))
        URL.revokeObjectURL(next.preview)
        settle(() => null)
      } catch (error) {
        settle((item) => ({ ...item, state: 'failed', error: said(error, t('products.imageBad')) }))
      } finally {
        busy.current = false
      }
    })()
  }, [queue, t])

  // A picture copied anywhere is pasted here, wherever the cursor is: a text field has no use for one.
  useEffect(() => {
    if (!editable) {
      return
    }
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'))
      if (files.length) {
        event.preventDefault()
        latest.current.take(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [editable])

  /** Puts one photograph where another stands; the rest move over. */
  const move = async (id: string, to: string) => {
    const ids = images.map((image) => image.id)
    const target = ids.indexOf(to)
    const next = ids.filter((other) => other !== id)
    next.splice(target, 0, id)
    if (next.join() === ids.join()) {
      return
    }
    // At once on the screen; the answer confirms it, a refusal puts it back.
    keep(next.flatMap((key) => images.filter((image) => image.id === key)))
    try {
      keep(await api.put<ProductImageDto[]>(`/products/${productId}/images/order`, { ids: next }))
    } catch (error) {
      keep(images)
      toast.error(said(error, t('products.imageFailed')))
    }
  }

  const remove = async (image: ProductImageDto) => {
    if (
      !(await confirm({ title: t('products.imageDeleteConfirm'), confirmLabel: t('common.delete'), tone: 'danger' }))
    ) {
      return
    }
    try {
      keep(await api.delete<ProductImageDto[]>(`/products/${productId}/images/${image.id}`))
    } catch (error) {
      toast.error(said(error, t('products.imageFailed')))
    }
  }

  const paint = async (image: ProductImageDto, valueId: string | null) => {
    try {
      keep(await api.patch<ProductImageDto[]>(`/products/${productId}/images/${image.id}`, { valueId }))
    } catch (error) {
      toast.error(said(error, t('products.imageFailed')))
    }
  }

  const opened = (image: ProductImageDto) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setViewing(image)
    }
  }

  return (
    // Enter walks the form's fields; the photographs are not among them.
    <Card title={t('products.sectionImages')}>
      <div data-enter-skip>
        {productId ? (
          <div
            onDragOver={(event) => {
              if (editable && event.dataTransfer.types.includes('Files')) {
                event.preventDefault()
                setOver(true)
              }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              setOver(false)
              if (event.dataTransfer.files.length) {
                event.preventDefault()
                take(event.dataTransfer.files)
              }
            }}
            className={cn(
              'flex flex-wrap gap-3 rounded-md outline-2 outline-offset-4 outline-transparent outline-dashed',
              over && 'outline-accent',
            )}
          >
            {images.map((image, index) => (
              <figure
                key={image.id}
                draggable={editable}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', image.id)
                  event.dataTransfer.effectAllowed = 'move'
                  setDragged(image.id)
                }}
                onDragEnd={() => setDragged(null)}
                onDragOver={(event) => {
                  if (dragged && dragged !== image.id) {
                    event.preventDefault()
                  }
                }}
                onDrop={(event) => {
                  if (dragged) {
                    event.preventDefault()
                    event.stopPropagation()
                    void move(dragged, image.id)
                    setDragged(null)
                  }
                }}
                className={cn('group relative w-32', dragged === image.id && 'opacity-40')}
              >
                {/* Not a button: a form that may only be looked at switches its buttons off, and a photograph is still to be seen. */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t('products.imageOpen')}
                  onClick={() => setViewing(image)}
                  onKeyDown={opened(image)}
                  className="block cursor-zoom-in rounded-md"
                >
                  <Thumb image={{ url: image.medium, blur: image.blur }} className="size-32 border border-line" />
                </span>
                {index === 0 ? (
                  <span className="absolute top-1 left-1 rounded bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium shadow-card">
                    {t('products.imageMain')}
                  </span>
                ) : null}
                {editable ? (
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {index > 0 ? (
                      <Tooltip content={t('products.imageMakeMain')}>
                        <Button
                          size="iconSm"
                          aria-label={t('products.imageMakeMain')}
                          onClick={() => void move(image.id, images[0].id)}
                        >
                          <Star />
                        </Button>
                      </Tooltip>
                    ) : null}
                    <Tooltip content={t('common.delete')}>
                      <Button size="iconSm" aria-label={t('common.delete')} onClick={() => void remove(image)}>
                        <Trash2 />
                      </Button>
                    </Tooltip>
                  </div>
                ) : null}
                {colors.length ? (
                  <Select
                    className="mt-1.5 h-7 px-2 text-xs"
                    value={image.valueId ?? ALL}
                    disabled={!editable}
                    onChange={(value) => void paint(image, value === ALL ? null : value)}
                    options={[
                      { value: ALL, label: t('products.imageAllColors') },
                      ...colors.map((color) => ({ value: color.id, label: color.name })),
                    ]}
                  />
                ) : null}
              </figure>
            ))}

            {queue.map((item) => (
              <figure key={item.key} className="relative w-32">
                <span className="relative block size-32 overflow-hidden rounded-md border border-line bg-sunken">
                  {/* What could not be read as a picture has nothing to show. */}
                  {item.state === 'failed' ? null : (
                    <>
                      <img src={item.preview} alt="" className="size-full object-cover opacity-50" />
                      <Spinner className="absolute inset-0 m-auto" />
                    </>
                  )}
                </span>
                {item.state === 'failed' ? (
                  <>
                    <p className="mt-1 text-[11px] leading-tight text-bad">{item.error}</p>
                    <div className="absolute top-1 right-1 flex gap-1">
                      <Tooltip content={t('products.imageRetry')}>
                        <Button
                          size="iconSm"
                          aria-label={t('products.imageRetry')}
                          onClick={() =>
                            setQueue((current) =>
                              current.map((other) => (other.key === item.key ? { ...other, state: 'waiting' } : other)),
                            )
                          }
                        >
                          <RotateCw />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t('common.delete')}>
                        <Button
                          size="iconSm"
                          aria-label={t('common.delete')}
                          onClick={() => {
                            URL.revokeObjectURL(item.preview)
                            setQueue((current) => current.filter((other) => other.key !== item.key))
                          }}
                        >
                          <X />
                        </Button>
                      </Tooltip>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-[11px] text-ink-3">
                    {t(item.state === 'sending' ? 'products.imageSending' : 'products.imageWaiting')}
                  </p>
                )}
              </figure>
            ))}

            {editable && room > 0 ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex size-32 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-xs text-ink-3 transition-colors hover:border-accent hover:text-accent-ink"
              >
                <ImagePlus className="size-5" />
                {t('products.imageAdd')}
              </button>
            ) : null}
            {!editable && !images.length ? <p className="text-xs text-ink-3">{t('products.imagesNone')}</p> : null}
          </div>
        ) : (
          <p className="text-xs text-ink-3">{t('products.imagesAfterSave')}</p>
        )}
        {editable ? (
          <p className="mt-3 text-xs text-ink-3">{t('products.imagesHint', { max: MAX_PRODUCT_IMAGES })}</p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            take(event.target.files ?? [])
            // The same file may be chosen again after it was turned back.
            event.target.value = ''
          }}
        />
      </div>
      {viewing ? (
        <Dialog open onClose={() => setViewing(null)} title={t('products.sectionImages')} size="xl">
          <img
            src={viewing.large}
            alt=""
            width={viewing.width}
            height={viewing.height}
            style={{ backgroundImage: `url(${viewing.blur})` }}
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md bg-cover"
          />
        </Dialog>
      ) : null}
    </Card>
  )
}
