import { type LabelDesign, type LabelDesigns } from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Star, Tag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/controls'
import { useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Spinner } from '@/components/ui/feedback'
import { Card, PageActions } from '@/components/ui/page'
import { DesignView, useSampleValues } from '@/features/labels/design-view'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'

import { LabelDesigner } from './label-designer'

const KEY = ['labels', 'designs']

export const useLabelDesigns = () =>
  useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<LabelDesigns>('/labels/designs', undefined, signal) })

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`)

/**
 * The business's own label designs: each placed element by element in the designer. One of them is what printing
 * picks first; the usual layout below stays for whoever needs none.
 */
export function LabelDesignList() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const designs = useLabelDesigns()
  const sample = useSampleValues()
  const [editing, setEditing] = useState<LabelDesign | null>(null)

  const save = useMutation({
    mutationFn: (next: LabelDesigns) => api.put<LabelDesigns>('/labels/designs', next),
    onSuccess: (saved) => {
      queryClient.setQueryData(KEY, saved)
      setEditing(null)
      toast.success(t('common.saved'))
    },
  })

  if (!designs.data) {
    return <Spinner />
  }
  const list = designs.data
  const put = (design: LabelDesign) => {
    const exists = list.designs.some((item) => item.id === design.id)
    save.mutate({
      designs: exists ? list.designs.map((item) => (item.id === design.id ? design : item)) : [...list.designs, design],
      defaultId: list.defaultId ?? design.id,
    })
  }

  return (
    <Card title={t('labelDesign.title')}>
      <PageActions>
        <Button
          onClick={() =>
            setEditing({ id: newId(), name: '', width: 58, height: 40, barcode: 'code128', elements: [], logo: null })
          }
        >
          <Plus />
          {t('labelDesign.new')}
        </Button>
      </PageActions>
      {list.designs.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.designs.map((design) => (
            <div
              key={design.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-card"
            >
              <button
                type="button"
                className="flex justify-center rounded-md bg-sunken p-3"
                onClick={() => setEditing(design)}
              >
                <DesignView
                  design={design}
                  values={sample}
                  scale={Math.min(0.6, 240 / (design.width * 8))}
                />
              </button>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{design.name}</p>
                  <p className="text-xs text-ink-3">
                    {design.width} × {design.height} mm
                  </p>
                </div>
                {design.id === list.defaultId ? <Badge tone="accent">{t('labelDesign.default')}</Badge> : null}
                <Menu
                  trigger={
                    <Button size="icon" variant="ghost" aria-label={t('common.actions')}>
                      <Pencil />
                    </Button>
                  }
                  items={[
                    { label: t('common.edit'), icon: <Pencil />, onSelect: () => setEditing(design) },
                    ...(design.id === list.defaultId
                      ? []
                      : [
                          {
                            label: t('labelDesign.makeDefault'),
                            icon: <Star />,
                            onSelect: () => save.mutate({ ...list, defaultId: design.id }),
                          },
                        ]),
                    {
                      label: t('common.delete'),
                      icon: <Trash2 />,
                      tone: 'danger' as const,
                      onSelect: async () => {
                        if (
                          await confirm({
                            title: t('labelDesign.deleteConfirm', { name: design.name }),
                            confirmLabel: t('common.delete'),
                            tone: 'danger',
                          })
                        ) {
                          save.mutate({
                            designs: list.designs.filter((item) => item.id !== design.id),
                            defaultId: list.defaultId === design.id ? null : list.defaultId,
                          })
                        }
                      },
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Tag} title={t('labelDesign.none')} hint={t('labelDesign.hint')} />
      )}
      {editing ? (
        <LabelDesigner design={editing} saving={save.isPending} onSave={put} onClose={() => setEditing(null)} />
      ) : null}
    </Card>
  )
}
