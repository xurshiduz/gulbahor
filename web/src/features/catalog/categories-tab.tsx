import { categoryInputSchema, MAX_AXES, type AttributeDto, type CategoryDto, type CategoryInput } from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, FolderPlus, FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Menu, Switch } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PageActions } from '@/components/ui/page'
import { api } from '@/lib/api'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'

import { categoryAxisIds, categoryTree, useAttributes, useCategories, type CategoryNode } from './catalog'

type Editing = { category: CategoryDto } | { parentId: string | null }

export function CategoriesTab({ canManage, starter }: { canManage: boolean; starter: ReactNode }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const categories = useCategories()
  const attributes = useAttributes()
  const [editing, setEditing] = useState<Editing | null>(null)

  const rows = useMemo(() => categoryTree(categories.data ?? []), [categories.data])
  const attributeNames = useMemo(
    () => new Map((attributes.data ?? []).map((attribute) => [attribute.id, attribute.name])),
    [attributes.data],
  )
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['categories'] })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/categories/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      refresh()
      toast.success(t('references.deleted'))
    },
  })

  useHotkey('n', () => setEditing({ parentId: null }), {
    label: t('references.addCategory'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !editing,
  })

  const columns = useMemo<ColumnDef<CategoryNode>[]>(
    () => [
      {
        id: 'name',
        header: t('references.name'),
        meta: { fixed: true },
        cell: ({ row }) => (
          <span className="flex items-center" style={{ paddingLeft: row.original.depth * 20 }}>
            <span className={row.original.depth ? undefined : 'font-medium'}>{row.original.name}</span>
          </span>
        ),
      },
      {
        id: 'axes',
        header: t('references.axes'),
        cell: ({ row }) =>
          row.original.axisIds ? (
            <span className="flex flex-wrap gap-1">
              {row.original.axisIds.length ? (
                row.original.axisIds.map((id) => <Badge key={id}>{attributeNames.get(id) ?? '?'}</Badge>)
              ) : (
                <span className="text-ink-3">{t('references.noAxes')}</span>
              )}
            </span>
          ) : (
            <span className="text-xs text-ink-3">{t('references.inherited')}</span>
          ),
      },
      {
        id: 'products',
        header: t('references.products'),
        meta: { className: 'tabular w-px text-right', headerClassName: 'text-right' },
        cell: ({ row }) => row.original.productCount || <span className="text-ink-3">—</span>,
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { className: 'w-px' },
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="ok">{t('common.active')}</Badge> : <Badge>{t('common.archived')}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) =>
          canManage ? (
            <span onClick={(event) => event.stopPropagation()}>
              <Menu
                trigger={
                  <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                }
                items={[
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => setEditing({ category: row.original }) },
                  {
                    label: t('references.addChild'),
                    icon: <FolderPlus />,
                    onSelect: () => setEditing({ parentId: row.original.id }),
                  },
                  row.original.isActive
                    ? {
                        label: t('common.archive'),
                        icon: <Archive />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: false }),
                      }
                    : {
                        label: t('common.restore'),
                        icon: <ArchiveRestore />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: true }),
                      },
                  'separator',
                  {
                    label: t('common.delete'),
                    icon: <Trash2 />,
                    tone: 'danger',
                    onSelect: async () => {
                      if (
                        await confirm({
                          title: t('references.deleteConfirm', { name: row.original.name }),
                          confirmLabel: t('common.delete'),
                          tone: 'danger',
                        })
                      ) {
                        remove.mutate(row.original.id)
                      }
                    },
                  },
                ]}
              />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, attributeNames],
  )

  return (
    <>
      <PageActions>
        {canManage ? (
          <Button variant="primary" onClick={() => setEditing({ parentId: null })}>
            <Plus />
            {t('references.addCategory')}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null}
      </PageActions>
      <DataTable
        columns={columns}
        data={categories.data ? rows : undefined}
        loading={categories.isPending}
        rowId={(row) => row.id}
        onRowOpen={canManage ? (row) => setEditing({ category: row }) : undefined}
        rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
        empty={<EmptyState icon={FolderTree} title={t('references.categoriesEmpty')} action={starter} />}
      />
      {editing ? (
        <CategoryDialog
          editing={editing}
          categories={categories.data ?? []}
          attributes={attributes.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}

interface Values {
  name: string
  parentId: string | null
  inherit: boolean
  axisIds: string[]
}

interface DialogProps {
  editing: Editing
  categories: CategoryDto[]
  attributes: AttributeDto[]
  onClose: () => void
  onSaved: () => void
}

function CategoryDialog({ editing, categories, attributes, onClose, onSaved }: DialogProps) {
  const { t } = useTranslation()
  const category = 'category' in editing ? editing.category : null
  const formId = 'category-form'

  const form = useForm<Values>({
    defaultValues: {
      name: category?.name ?? '',
      parentId: 'category' in editing ? editing.category.parentId : editing.parentId,
      inherit: category ? category.axisIds === null : true,
      axisIds: category?.axisIds ?? [],
    },
  })
  const errors = form.formState.errors
  const inherit = form.watch('inherit')
  const parentId = form.watch('parentId')

  // A category cannot move under itself or anything below it.
  const parentOptions = useMemo(() => {
    const tree = categoryTree(categories)
    const blocked = new Set<string>()
    if (category) {
      blocked.add(category.id)
      for (const node of tree) {
        if (node.parentId && blocked.has(node.parentId)) {
          blocked.add(node.id)
        }
      }
    }
    return tree
      .filter((node) => !blocked.has(node.id) && (node.isActive || node.id === category?.parentId))
      .map((node) => ({ value: node.id, label: node.path }))
  }, [categories, category])

  const attributeOptions = attributes
    .filter((attribute) => attribute.isActive || category?.axisIds?.includes(attribute.id))
    .map((attribute) => ({ value: attribute.id, label: attribute.name }))
  const inheritedNames = (categoryAxisIds(categories, parentId) ?? [])
    .map((id) => attributes.find((attribute) => attribute.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  const mutation = useMutation({
    mutationFn: (input: CategoryInput) =>
      category ? api.put(`/categories/${category.id}`, input) : api.post('/categories', input),
    onSuccess: () => {
      onSaved()
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  const submit = form.handleSubmit((values) => {
    const input = zodCheck(form, categoryInputSchema, {
      name: values.name,
      parentId: values.parentId,
      axisIds: values.inherit ? null : values.axisIds,
    })
    if (input) {
      mutation.mutate(input)
    }
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? t('references.editCategory') : t('references.addCategory')}
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
      <Form id={formId} onSubmit={() => void submit()}>
        <Field label={t('references.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label={t('references.parent')} hint={t('references.parentHint')} error={errors.parentId?.message}>
          {(id) => (
            <Controller
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <Combobox
                  id={id}
                  options={parentOptions}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.parentId}
                  placeholder={t('references.topLevel')}
                />
              )}
            />
          )}
        </Field>
        <Controller
          control={form.control}
          name="inherit"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              label={t('references.inheritAxes')}
              hint={
                inheritedNames
                  ? t('references.inheritAxesNow', { names: inheritedNames })
                  : t('references.inheritAxesHint')
              }
            />
          )}
        />
        {!inherit ? (
          <Field
            label={t('references.axes')}
            hint={t('references.axesHint', { max: MAX_AXES })}
            error={errors.axisIds?.message}
          >
            {(id) => (
              <Controller
                control={form.control}
                name="axisIds"
                render={({ field }) => (
                  <Combobox
                    id={id}
                    multiple
                    options={attributeOptions}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.axisIds}
                  />
                )}
              />
            )}
          </Field>
        ) : null}
      </Form>
    </Dialog>
  )
}
