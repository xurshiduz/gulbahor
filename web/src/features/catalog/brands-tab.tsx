import { brandInputSchema, matchScore, queryKeys, searchKey, type BrandDto, type BrandInput } from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PageActions, SearchInput } from '@/components/ui/page'
import { api } from '@/lib/api'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'

import { useBrands } from './catalog'

export function BrandsTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const brands = useBrands()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<BrandDto | 'new' | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['brands'] })

  const rows = useMemo(() => {
    const keys = queryKeys(query)
    return keys.length
      ? (brands.data ?? []).filter((brand) => matchScore(keys, searchKey(brand.name)) > 0)
      : brands.data
  }, [brands.data, query])

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/brands/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/brands/${id}`),
    onSuccess: () => {
      refresh()
      toast.success(t('references.deleted'))
    },
  })

  useHotkey('n', () => setEditing('new'), {
    label: t('references.addBrand'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !editing,
  })

  const columns = useMemo<ColumnDef<BrandDto>[]>(
    () => [
      {
        id: 'name',
        header: t('references.name'),
        meta: { fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
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
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => setEditing(row.original) },
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
    [t, canManage],
  )

  return (
    <>
      <PageActions>
        {canManage ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus />
            {t('references.addBrand')}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null}
      </PageActions>
      <DataTable
        columns={columns}
        data={rows}
        loading={brands.isPending}
        rowId={(row) => row.id}
        onRowOpen={canManage ? (row) => setEditing(row) : undefined}
        rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
        toolbar={
          <>
            <SearchInput value={query} onChange={setQuery} />
          </>
        }
        empty={
          <EmptyState
            icon={Tag}
            title={query ? t('common.nothingFound') : t('references.brandsEmpty')}
            hint={query ? undefined : t('references.brandsEmptyHint')}
          />
        }
      />
      {editing ? (
        <BrandDialog brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      ) : null}
    </>
  )
}

function BrandDialog({
  brand,
  onClose,
  onSaved,
}: {
  brand: BrandDto | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const formId = 'brand-form'
  const form = useForm<{ name: string }>({ defaultValues: { name: brand?.name ?? '' } })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: BrandInput) => (brand ? api.put(`/brands/${brand.id}`, input) : api.post('/brands', input)),
    onSuccess: () => {
      onSaved()
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
      title={brand ? t('references.editBrand') : t('references.addBrand')}
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
      <Form id={formId} onSubmit={() => void zodSubmit(form, brandInputSchema, (input) => mutation.mutate(input))()}>
        <Field label={t('references.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
      </Form>
    </Dialog>
  )
}
