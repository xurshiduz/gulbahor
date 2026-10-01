import {
  ATTRIBUTE_KIND_LABELS,
  ATTRIBUTE_KINDS,
  attributeInputSchema,
  attributeValueInputSchema,
  type AttributeDto,
  type AttributeInput,
  type AttributeKind,
  type AttributeValueDto,
  type AttributeValueInput,
} from '@gulbahor/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ColorDot } from '@/components/ui/combobox'
import { Menu, Select } from '@/components/ui/controls'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useHotkey } from '@/lib/hotkeys'

import { useAttributes } from './catalog'

const DEFAULT_HEX = '#9E9E9E'

type Editing = { attribute: AttributeDto | null } | { value: AttributeValueDto; kind: AttributeKind }

/**
 * The lists variants are made of. Attributes on the left; on the right the
 * values of the chosen one, in the order they appear everywhere else.
 */
export function AttributesTab({ canManage, starter }: { canManage: boolean; starter: ReactNode }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const attributes = useAttributes()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)

  const selected = attributes.data?.find((attribute) => attribute.id === selectedId) ?? attributes.data?.[0]

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['attributes'] })
  /** Value changes answer with the whole attribute, so the list is right before any refetch. */
  const store = (updated: AttributeDto) =>
    queryClient.setQueryData<AttributeDto[]>(['attributes'], (current) =>
      current?.map((attribute) => (attribute.id === updated.id ? updated : attribute)),
    )

  const change = useMutation({
    mutationFn: (request: { method: 'post' | 'put' | 'delete'; path: string; body?: unknown }) =>
      request.method === 'delete'
        ? api.delete<AttributeDto | undefined>(request.path)
        : api[request.method]<AttributeDto>(request.path, request.body),
    onSuccess: (updated) => (updated ? store(updated) : refresh()),
  })

  useHotkey('n', () => setEditing({ attribute: null }), {
    label: t('references.addAttribute'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !editing,
  })

  if (attributes.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!attributes.data?.length) {
    return (
      <div className="rounded-lg border border-line bg-surface shadow-card">
        <EmptyState
          icon={Palette}
          title={t('references.attributesEmpty')}
          hint={t('references.attributesEmptyHint')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {starter}
              {canManage ? (
                <Button size="sm" onClick={() => setEditing({ attribute: null })}>
                  <Plus />
                  {t('references.addAttribute')}
                </Button>
              ) : null}
            </div>
          }
        />
        {editing && 'attribute' in editing ? (
          <AttributeDialog attribute={null} onClose={() => setEditing(null)} onSaved={refresh} />
        ) : null}
      </div>
    )
  }

  const move = (attribute: AttributeDto, index: number, delta: number) => {
    const ids = attribute.values.map((value) => value.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) {
      return
    }
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    // Shown at once; the server's answer confirms it.
    store({
      ...attribute,
      values: ids.map((id) => attribute.values.find((value) => value.id === id) as AttributeValueDto),
    })
    change.mutate({ method: 'put', path: `/attributes/${attribute.id}/values/order`, body: { ids } })
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[17rem_1fr]">
      <div className="flex min-h-0 flex-col rounded-lg border border-line bg-surface shadow-card">
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {attributes.data.map((attribute) => (
            <button
              key={attribute.id}
              type="button"
              onClick={() => setSelectedId(attribute.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-sunken',
                attribute.id === selected?.id && 'bg-accent-soft font-medium text-accent-ink hover:bg-accent-soft',
                !attribute.isActive && 'text-ink-3',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{attribute.name}</span>
              <span className="tabular text-xs text-ink-3">{attribute.values.length}</span>
            </button>
          ))}
        </div>
        {canManage ? (
          <div className="border-t border-line p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setEditing({ attribute: null })}
            >
              <Plus />
              {t('references.addAttribute')}
              <Shortcut combo="n" className="ml-auto" />
            </Button>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="flex min-h-0 flex-col rounded-lg border border-line bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">{selected.name}</h2>
            <Badge tone={selected.kind === 'color' ? 'accent' : selected.kind === 'size' ? 'info' : 'neutral'}>
              {ATTRIBUTE_KIND_LABELS[selected.kind]}
            </Badge>
            {!selected.isActive ? <Badge>{t('common.archived')}</Badge> : null}
            <span className="flex-1" />
            {canManage ? (
              <Menu
                trigger={
                  <Button variant="ghost" size="iconSm" aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                }
                items={[
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => setEditing({ attribute: selected }) },
                  selected.isActive
                    ? {
                        label: t('common.archive'),
                        icon: <Archive />,
                        onSelect: () => change.mutate({ method: 'post', path: `/attributes/${selected.id}/archive` }),
                      }
                    : {
                        label: t('common.restore'),
                        icon: <ArchiveRestore />,
                        onSelect: () => change.mutate({ method: 'post', path: `/attributes/${selected.id}/restore` }),
                      },
                  'separator',
                  {
                    label: t('common.delete'),
                    icon: <Trash2 />,
                    tone: 'danger',
                    onSelect: async () => {
                      if (
                        await confirm({
                          title: t('references.deleteConfirm', { name: selected.name }),
                          confirmLabel: t('common.delete'),
                          tone: 'danger',
                        })
                      ) {
                        change.mutate(
                          { method: 'delete', path: `/attributes/${selected.id}` },
                          { onSuccess: () => setSelectedId(null) },
                        )
                      }
                    },
                  },
                ]}
              />
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {selected.values.length ? (
              selected.values.map((value, index) => (
                <div
                  key={value.id}
                  className={cn(
                    'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] hover:bg-sunken',
                    !value.isActive && 'text-ink-3',
                  )}
                >
                  <span className="tabular w-5 text-right text-xs text-ink-3">{index + 1}</span>
                  {selected.kind === 'color' ? (
                    <ColorDot color={value.hex ?? 'transparent'} className="size-4" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{value.name}</span>
                  {!value.isActive ? <Badge>{t('common.archived')}</Badge> : null}
                  {canManage ? (
                    <span className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        disabled={index === 0}
                        onClick={() => move(selected, index, -1)}
                        aria-label={t('references.moveUp')}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        disabled={index === selected.values.length - 1}
                        onClick={() => move(selected, index, 1)}
                        aria-label={t('references.moveDown')}
                      >
                        <ArrowDown />
                      </Button>
                      <Menu
                        trigger={
                          <Button variant="ghost" size="iconSm" aria-label={t('common.actions')}>
                            <MoreHorizontal />
                          </Button>
                        }
                        items={[
                          {
                            label: t('common.edit'),
                            icon: <Pencil />,
                            onSelect: () => setEditing({ value, kind: selected.kind }),
                          },
                          value.isActive
                            ? {
                                label: t('common.archive'),
                                icon: <Archive />,
                                onSelect: () =>
                                  change.mutate({ method: 'post', path: `/attributes/values/${value.id}/archive` }),
                              }
                            : {
                                label: t('common.restore'),
                                icon: <ArchiveRestore />,
                                onSelect: () =>
                                  change.mutate({ method: 'post', path: `/attributes/values/${value.id}/restore` }),
                              },
                          'separator',
                          {
                            label: t('common.delete'),
                            icon: <Trash2 />,
                            tone: 'danger',
                            onSelect: async () => {
                              if (
                                await confirm({
                                  title: t('references.deleteConfirm', { name: value.name }),
                                  confirmLabel: t('common.delete'),
                                  tone: 'danger',
                                })
                              ) {
                                change.mutate({ method: 'delete', path: `/attributes/values/${value.id}` })
                              }
                            },
                          },
                        ]}
                      />
                    </span>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-xs text-ink-3">{t('references.valuesEmpty')}</p>
            )}
          </div>

          {canManage ? <QuickAdd key={selected.id} attribute={selected} onAdded={store} /> : null}
        </div>
      ) : null}

      {editing && 'attribute' in editing ? (
        <AttributeDialog
          attribute={editing.attribute}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            refresh()
            setSelectedId(saved.id)
          }}
        />
      ) : null}
      {editing && 'value' in editing ? (
        <ValueDialog value={editing.value} kind={editing.kind} onClose={() => setEditing(null)} onSaved={store} />
      ) : null}
    </div>
  )
}

/** Type a value and press Enter, again and again. Several at once go in separated by commas: "S, M, L, XL". */
function QuickAdd({ attribute, onAdded }: { attribute: AttributeDto; onAdded: (updated: AttributeDto) => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [hex, setHex] = useState(DEFAULT_HEX)
  const [error, setError] = useState<string>()
  const isColor = attribute.kind === 'color'

  const mutation = useMutation({
    mutationFn: (names: string[]) =>
      api.post<AttributeDto>(`/attributes/${attribute.id}/values`, {
        values: names.map((name) => ({ name, hex: isColor ? hex : null })),
      }),
    meta: { silent: true },
    onSuccess: (updated) => {
      onAdded(updated)
      setText('')
      ref.current?.focus()
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? (failure.fields?.name ?? Object.values(failure.fields ?? {})[0] ?? failure.message)
          : String(failure),
      ),
  })

  const submit = () => {
    const names = text
      .split(/[,;\n]+/)
      .map((name) => name.trim())
      .filter(Boolean)
    if (names.length) {
      mutation.mutate(names)
    }
  }

  return (
    <div className="border-t border-line p-2.5">
      <div className="flex items-center gap-2">
        {isColor ? (
          <input
            type="color"
            value={hex}
            onChange={(event) => setHex(event.target.value.toUpperCase())}
            aria-label={t('references.color')}
            className="size-8.5 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface p-0.5"
          />
        ) : null}
        <Input
          ref={ref}
          value={text}
          invalid={!!error}
          placeholder={isColor ? t('references.newColor') : t('references.newValues')}
          onChange={(event) => {
            setError(undefined)
            setText(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
        <Button onClick={submit} loading={mutation.isPending} disabled={!text.trim()}>
          <Plus />
          {t('common.add')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function AttributeDialog({
  attribute,
  onClose,
  onSaved,
}: {
  attribute: AttributeDto | null
  onClose: () => void
  onSaved: (saved: AttributeDto) => void
}) {
  const { t } = useTranslation()
  const formId = 'attribute-form'
  const form = useForm<{ name: string; kind: AttributeKind }>({
    defaultValues: { name: attribute?.name ?? '', kind: attribute?.kind ?? 'size' },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: AttributeInput) =>
      attribute
        ? api.put<AttributeDto>(`/attributes/${attribute.id}`, input)
        : api.post<AttributeDto>('/attributes', input),
    onSuccess: (saved) => {
      onSaved(saved)
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={attribute ? t('references.editAttribute') : t('references.addAttribute')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form
        id={formId}
        onSubmit={() => void zodSubmit(form, attributeInputSchema, (input) => mutation.mutate(input))()}
      >
        <Field
          label={t('references.name')}
          hint={t('references.attributeNameHint')}
          error={errors.name?.message}
          required
        >
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field
          label={t('references.attributeKind')}
          hint={t('references.attributeKindHint')}
          error={errors.kind?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  options={ATTRIBUTE_KINDS.map((kind) => ({ value: kind, label: ATTRIBUTE_KIND_LABELS[kind] }))}
                />
              )}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}

interface ValueDialogProps {
  value: AttributeValueDto
  kind: AttributeKind
  onClose: () => void
  onSaved: (updated: AttributeDto) => void
}

function ValueDialog({ value, kind, onClose, onSaved }: ValueDialogProps) {
  const { t } = useTranslation()
  const formId = 'attribute-value-form'
  const form = useForm<{ name: string; hex: string }>({
    defaultValues: { name: value.name, hex: value.hex ?? DEFAULT_HEX },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: AttributeValueInput) => api.put<AttributeDto>(`/attributes/values/${value.id}`, input),
    onSuccess: (updated) => {
      onSaved(updated)
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('references.editValue')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form
        id={formId}
        onSubmit={() => void zodSubmit(form, attributeValueInputSchema, (input) => mutation.mutate(input))()}
      >
        <Field label={t('references.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        {kind === 'color' ? (
          <Field label={t('references.color')} error={errors.hex?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="hex"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9A-F]{6}$/i.test(field.value) ? field.value : DEFAULT_HEX}
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      tabIndex={-1}
                      aria-label={t('references.color')}
                      className="size-8.5 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface p-0.5"
                    />
                    <Input
                      id={id}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="font-code uppercase"
                      maxLength={7}
                      invalid={!!errors.hex}
                    />
                  </div>
                )}
              />
            )}
          </Field>
        ) : null}
      </Form>
    </Dialog>
  )
}
