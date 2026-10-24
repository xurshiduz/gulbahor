import {
  LABEL_ALIGNS,
  LABEL_BARCODE_TYPES,
  LABEL_FIELDS,
  labelDesignSchema,
  labelElementSchema,
  type LabelAlign,
  type LabelBarcodeType,
  type LabelDesign,
  type LabelElement,
  type LabelField,
} from '@erp/core'
import { AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Plus, Underline, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select, Switch } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { DesignView, useSampleValues } from '@/features/labels/design-view'
import { cn } from '@/lib/cn'
import { pictureForLabel, sourceForLabel } from '@/lib/label-picture'
import { toast } from '@/lib/toast'

const DOTS_PER_MM = 8
const SIZES = [5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40]
const ALIGN_ICONS: Record<LabelAlign, typeof AlignLeft> = { L: AlignLeft, C: AlignCenter, R: AlignRight }

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`)

/** Where a new element goes: under the lowest one, as wide as there is room for, inside the label. */
function placeFor(design: LabelDesign, field: LabelField): Pick<LabelElement, 'x' | 'y' | 'w' | 'h'> {
  const h = field === 'barcode' ? 12 : field === 'logo' ? 12 : 4.5
  const w = Math.min(field === 'barcode' ? 30 : 28, design.width - 4)
  const below = Math.max(0, ...design.elements.map((element) => element.y + element.h))
  const y = below + 1 + h <= design.height ? below + 1 : 2
  return { x: 2, y: Math.min(y, Math.max(0, design.height - h)), w, h }
}

interface LabelDesignerProps {
  design: LabelDesign
  onSave: (design: LabelDesign) => void
  onClose: () => void
  saving: boolean
}

/**
 * One label design: its size and barcode on top; on the left what it shows, on the label itself where — dragged
 * to move, its corner to resize — and beside it how the picked element is set. The label is drawn as it prints.
 */
export function LabelDesigner({ design: start, onSave, onClose, saving }: LabelDesignerProps) {
  const { t } = useTranslation()
  const [design, setDesign] = useState<LabelDesign>(start)
  const [selected, setSelected] = useState<string | null>(start.elements[0]?.id ?? null)
  const [adding, setAdding] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const drawn = useRef(0)
  const sample = useSampleValues()
  const dirty = JSON.stringify(design) !== JSON.stringify(start)
  const element = design.elements.find((item) => item.id === selected) ?? null
  // As large as the window lets a label be, never smaller than a millimetre to six pixels.
  const scale = Math.max(0.75, Math.min(2, 640 / (design.width * DOTS_PER_MM)))

  const patch = (next: Partial<LabelDesign>) => setDesign((current) => ({ ...current, ...next }))
  const patchElement = (id: string, next: Partial<LabelElement>) =>
    setDesign((current) => ({
      ...current,
      elements: current.elements.map((item) => (item.id === id ? { ...item, ...next } : item)),
    }))
  const remove = (id: string) => {
    setDesign((current) => ({
      ...current,
      elements: current.elements.filter((item) => item.id !== id),
      logo: current.elements.find((item) => item.id === id)?.field === 'logo' ? null : current.logo,
    }))
    setSelected(null)
  }
  const add = (field: LabelField) => {
    const made = labelElementSchema.parse({ id: newId(), field, ...placeFor(design, field) })
    setDesign((current) => ({ ...current, elements: [...current.elements, made] }))
    setSelected(made.id)
  }

  /** The logo's dots, made for its box: again whenever the box changes size, from the picture as given. */
  const drawLogo = async (source: Blob | string, box: LabelElement) => {
    const turn = ++drawn.current
    try {
      const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source
      const picture = await pictureForLabel(blob, box.w * DOTS_PER_MM)
      const sourceUrl = typeof source === 'string' ? source : await sourceForLabel(source)
      // Dragging the corner starts a redraw at every step: only the last one may land.
      if (turn !== drawn.current) {
        return
      }
      const height = picture.height / DOTS_PER_MM
      setDesign((current) => ({
        ...current,
        logo: { ...picture, source: sourceUrl },
        elements: current.elements.map((item) => (item.id === box.id ? { ...item, h: Math.max(2, height) } : item)),
      }))
    } catch {
      toast.error(t('labelDesign.logoBad'))
    }
  }
  const pickLogo = async (picked: File) => {
    let box = design.elements.find((item) => item.field === 'logo')
    if (!box) {
      box = labelElementSchema.parse({ id: newId(), field: 'logo', ...placeFor(design, 'logo') })
      const made = box
      setDesign((current) => ({ ...current, elements: [...current.elements, made] }))
    }
    setSelected(box.id)
    await drawLogo(picked, box)
  }
  const moved = (id: string, box: Pick<LabelElement, 'x' | 'y' | 'w' | 'h'>) => {
    const before = design.elements.find((item) => item.id === id)
    patchElement(id, box)
    // A logo resized across is drawn again at its new width, from the picture as it was given.
    if (before?.field === 'logo' && box.w !== before.w && design.logo?.source) {
      void drawLogo(design.logo.source, { ...before, ...box })
    }
  }

  const save = () => {
    const parsed = labelDesignSchema.safeParse(design)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('receipt.bad'))
      return
    }
    onSave(parsed.data)
  }

  const fieldName = (field: LabelField) => t(`labelDesign.fields.${field}`)
  const offered = LABEL_FIELDS.filter((field) => field !== 'logo')

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      dirty={dirty}
      title={design.name || t('labelDesign.untitled')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={t('labelDesign.name')}>
            {(id) => (
              <Input
                id={id}
                value={design.name}
                maxLength={60}
                onChange={(event) => patch({ name: event.target.value })}
              />
            )}
          </Field>
          <Field label={t('labelDesign.width')}>
            {(id) => (
              <NumberInput
                id={id}
                value={design.width}
                min={10}
                max={200}
                decimals={1}
                suffix="mm"
                onChange={(value) => patch({ width: value ?? design.width })}
              />
            )}
          </Field>
          <Field label={t('labelDesign.height')}>
            {(id) => (
              <NumberInput
                id={id}
                value={design.height}
                min={10}
                max={200}
                decimals={1}
                suffix="mm"
                onChange={(value) => patch({ height: value ?? design.height })}
              />
            )}
          </Field>
          <Field label={t('labelDesign.barcode')}>
            {(id) => (
              <Select
                id={id}
                value={design.barcode}
                onChange={(value) => patch({ barcode: value as LabelBarcodeType })}
                options={LABEL_BARCODE_TYPES.filter((value) => value !== 'ean13').map((value) => ({ value, label: t(`labelDesign.barcode_${value}`) }))}
              />
            )}
          </Field>
        </div>

        <div className="grid min-h-[22rem] gap-4 lg:grid-cols-[14rem_minmax(0,1fr)_16rem]">
          {/* What the label shows, top to bottom as added; picked here or on the label. */}
          <div className="flex flex-col gap-1.5">
            {design.elements.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[13px]',
                  item.id === selected
                    ? 'border-accent/50 bg-accent-soft text-accent-ink'
                    : 'border-line hover:bg-sunken',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => setSelected(item.id)}
                >
                  {fieldName(item.field)}
                  {item.field === 'text' && item.text ? <span className="text-ink-3"> · {item.text}</span> : null}
                </button>
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  onClick={() => remove(item.id)}
                  className="shrink-0 rounded p-0.5 text-ink-3 hover:text-bad"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-1.5">
              <Select
                key={adding}
                value=""
                placeholder={t('labelDesign.add')}
                onChange={(value) => {
                  if (value) {
                    add(value as LabelField)
                    setAdding(value)
                  }
                }}
                options={offered.map((field) => ({ value: field, label: fieldName(field) }))}
                className="flex-1"
              />
              <Button
                size="icon"
                aria-label={t('labelDesign.logo')}
                title={t('labelDesign.logo')}
                onClick={() => file.current?.click()}
              >
                <ImagePlus />
              </Button>
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => {
                  const picked = event.target.files?.[0]
                  event.target.value = ''
                  if (picked) {
                    void pickLogo(picked)
                  }
                }}
              />
            </div>
            {!design.elements.length ? (
              <p className="flex items-center gap-1 text-xs text-ink-3">
                <Plus className="size-3" />
                {t('labelDesign.emptyHint')}
              </p>
            ) : null}
          </div>

          {/* The label as it prints, on a grey ground to show its edge. */}
          <div className="flex items-center justify-center overflow-auto rounded-lg bg-sunken p-4">
            <DesignView
              design={design}
              values={sample}
              scale={scale}
              selected={selected}
              onSelect={setSelected}
              onMove={moved}
            />
          </div>

          {/* How the picked element is set. */}
          <div className="flex flex-col gap-3">
            {element ? (
              <>
                <p className="text-sm font-medium">{fieldName(element.field)}</p>
                {element.field !== 'barcode' && element.field !== 'logo' ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={String(element.size)}
                        onChange={(value) => patchElement(element.id, { size: Number(value) })}
                        options={SIZES.map((size) => ({ value: String(size), label: String(size) }))}
                        className="w-20"
                      />
                      <Button
                        size="icon"
                        variant={element.bold ? 'primary' : 'secondary'}
                        aria-label={t('labelDesign.bold')}
                        onClick={() => patchElement(element.id, { bold: !element.bold })}
                      >
                        <Bold />
                      </Button>
                      <Button
                        size="icon"
                        variant={element.underline ? 'primary' : 'secondary'}
                        aria-label={t('labelDesign.underline')}
                        onClick={() => patchElement(element.id, { underline: !element.underline })}
                      >
                        <Underline />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {LABEL_ALIGNS.map((align) => {
                        const Icon = ALIGN_ICONS[align]
                        return (
                          <Button
                            key={align}
                            size="icon"
                            variant={element.align === align ? 'primary' : 'secondary'}
                            aria-label={t(`labelDesign.align_${align}`)}
                            onClick={() => patchElement(element.id, { align })}
                          >
                            <Icon />
                          </Button>
                        )
                      })}
                      <Select
                        value={String(element.lines)}
                        onChange={(value) => patchElement(element.id, { lines: Number(value) })}
                        options={[1, 2, 3, 4].map((lines) => ({
                          value: String(lines),
                          label: t('labelDesign.lines', { count: lines }),
                        }))}
                        className="flex-1"
                      />
                    </div>
                    {element.field === 'text' ? (
                      <Field label={t('labelDesign.text')}>
                        {(id) => (
                          <Input
                            id={id}
                            value={element.text}
                            maxLength={120}
                            onChange={(event) => patchElement(element.id, { text: event.target.value })}
                          />
                        )}
                      </Field>
                    ) : (
                      <Field label={t('labelDesign.prefix')} hint={t('labelDesign.prefixHint')}>
                        {(id) => (
                          <Input
                            id={id}
                            value={element.prefix}
                            maxLength={30}
                            onChange={(event) => patchElement(element.id, { prefix: event.target.value })}
                          />
                        )}
                      </Field>
                    )}
                  </>
                ) : null}
                {element.field === 'barcode' ? (
                  <>
                    <Switch
                      checked={element.digits}
                      onChange={(digits) => patchElement(element.id, { digits })}
                      label={t('labelDesign.digits')}
                    />
                    {element.digits ? (
                      // The digits grow or shrink; the bars take what height is left in the box.
                      <Field label={t('labelDesign.digitsSize')}>
                        {(id) => (
                          <Select
                            id={id}
                            value={String(element.size)}
                            onChange={(value) => patchElement(element.id, { size: Number(value) })}
                            options={SIZES.map((size) => ({ value: String(size), label: String(size) }))}
                            className="w-20"
                          />
                        )}
                      </Field>
                    ) : null}
                  </>
                ) : null}
                {element.field === 'logo' ? (
                  <Button onClick={() => file.current?.click()}>
                    <ImagePlus />
                    {design.logo ? t('labelDesign.logoChange') : t('labelDesign.logo')}
                  </Button>
                ) : null}
                {/* Exactly where, for those who would rather type it. */}
                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'w', 'h'] as const).map((key) => (
                    <Field key={key} label={t(`labelDesign.box_${key}`)}>
                      {(id) => (
                        <NumberInput
                          id={id}
                          value={element[key]}
                          decimals={1}
                          min={key === 'w' || key === 'h' ? 1 : 0}
                          max={key === 'x' || key === 'w' ? design.width : design.height}
                          suffix="mm"
                          onChange={(value) =>
                            value === null
                              ? undefined
                              : moved(element.id, {
                                  x: element.x,
                                  y: element.y,
                                  w: element.w,
                                  h: element.h,
                                  [key]: value,
                                })
                          }
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-3">{t('labelDesign.pickHint')}</p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
