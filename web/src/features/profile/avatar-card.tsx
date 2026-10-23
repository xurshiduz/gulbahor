import { AVATAR_SIDE } from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Card } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

/** How wide the circle the photo is framed in is on the screen. */
const VIEW = 280
const MAX_ZOOM = 4

interface Frame {
  image: HTMLImageElement
  zoom: number
  x: number
  y: number
}

/** How large the photo stands at this zoom: never smaller than the circle, whichever way it is longer. */
const scaleOf = (frame: Frame) => (VIEW / Math.min(frame.image.naturalWidth, frame.image.naturalHeight)) * frame.zoom

/** Moved no further than leaves the circle covered. */
function held(frame: Frame): Frame {
  const scale = scaleOf(frame)
  const spareX = Math.max(0, (frame.image.naturalWidth * scale - VIEW) / 2)
  const spareY = Math.max(0, (frame.image.naturalHeight * scale - VIEW) / 2)
  return {
    ...frame,
    x: Math.min(spareX, Math.max(-spareX, frame.x)),
    y: Math.min(spareY, Math.max(-spareY, frame.y)),
  }
}

/** Where the photo's top left corner stands in the circle, and how large it is drawn there. */
function placed(frame: Frame) {
  const scale = scaleOf(frame)
  const width = frame.image.naturalWidth * scale
  const height = frame.image.naturalHeight * scale
  return { left: VIEW / 2 - width / 2 + frame.x, top: VIEW / 2 - height / 2 + frame.y, width, height }
}

/** What is inside the circle, as the square kept: WebP where the browser writes it, JPEG where not. */
function drawn(frame: Frame): string {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIDE
  canvas.height = AVATAR_SIDE
  const context = canvas.getContext('2d') as CanvasRenderingContext2D
  const k = AVATAR_SIDE / VIEW
  const at = placed(frame)
  context.fillStyle = '#fff'
  context.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE)
  context.imageSmoothingQuality = 'high'
  context.drawImage(frame.image, at.left * k, at.top * k, at.width * k, at.height * k)
  const webp = canvas.toDataURL('image/webp', 0.85)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85)
}

/** The person's own picture: a photo of theirs, framed in a circle — moved by dragging, sized by the wheel or the slider. */
export function AvatarCard() {
  const { t } = useTranslation()
  const { me } = useSession()
  const queryClient = useQueryClient()
  const file = useRef<HTMLInputElement>(null)
  const [frame, setFrame] = useState<Frame | null>(null)

  const save = useMutation({
    mutationFn: (picture: string | null) => api.put<{ avatar: string | null }>('/auth/avatar', { picture }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      setFrame(null)
      toast.success(t('common.saved'))
    },
  })

  const pick = (picked: File | undefined) => {
    if (!picked) {
      return
    }
    const url = URL.createObjectURL(picked)
    const image = new Image()
    image.onload = () => setFrame({ image, zoom: 1, x: 0, y: 0 })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t('profile.avatarBad'))
    }
    image.src = url
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={me.user.fullName} src={me.user.avatar} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="truncate text-base font-semibold">{me.user.fullName}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => file.current?.click()}>
              <ImagePlus />
              {me.user.avatar ? t('profile.avatarChange') : t('profile.avatarAdd')}
            </Button>
            {me.user.avatar ? (
              <Button size="sm" variant="ghost" loading={save.isPending && !frame} onClick={() => save.mutate(null)}>
                <Trash2 />
                {t('profile.avatarRemove')}
              </Button>
            ) : null}
          </div>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            pick(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
      {frame ? (
        <FrameDialog
          frame={frame}
          onChange={setFrame}
          saving={save.isPending}
          onSave={() => save.mutate(drawn(frame))}
          onClose={() => {
            URL.revokeObjectURL(frame.image.src)
            setFrame(null)
          }}
        />
      ) : null}
    </Card>
  )
}

function FrameDialog({
  frame,
  onChange,
  saving,
  onSave,
  onClose,
}: {
  frame: Frame
  onChange: (frame: Frame) => void
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const drag = useRef<{ x: number; y: number; from: Frame } | null>(null)
  const latest = useRef(frame)
  useEffect(() => {
    latest.current = frame
  }, [frame])
  const at = placed(frame)
  const zoomTo = (zoom: number) => onChange(held({ ...latest.current, zoom: Math.min(MAX_ZOOM, Math.max(1, zoom)) }))

  const down = (event: PointerEvent) => {
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, from: frame }
  }
  const move = (event: PointerEvent) => {
    const now = drag.current
    if (now) {
      onChange(held({ ...now.from, x: now.from.x + event.clientX - now.x, y: now.from.y + event.clientY - now.y }))
    }
  }
  const wheel = (event: WheelEvent) => zoomTo(frame.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1))

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('profile.avatarFrame')}
      description={t('profile.avatarFrameHint')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={saving} onClick={onSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative cursor-grab touch-none overflow-hidden rounded-full bg-sunken ring-4 ring-accent-soft select-none active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={wheel}
        >
          <img
            src={frame.image.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ left: at.left, top: at.top, width: at.width, height: at.height }}
          />
        </div>
        <div className="flex w-full max-w-xs items-center gap-2 text-ink-3">
          <button type="button" tabIndex={-1} aria-label={t('profile.zoomOut')} onClick={() => zoomTo(frame.zoom / 1.2)}>
            <ZoomOut className="size-4" />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={frame.zoom}
            aria-label={t('profile.zoom')}
            onChange={(event) => zoomTo(Number(event.target.value))}
            className="flex-1 accent-[var(--color-accent)]"
          />
          <button type="button" tabIndex={-1} aria-label={t('profile.zoomIn')} onClick={() => zoomTo(frame.zoom * 1.2)}>
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>
    </Dialog>
  )
}
