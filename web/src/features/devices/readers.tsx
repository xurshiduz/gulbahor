import {
  DEFAULT_READER_PORT,
  READER_KIND_LABELS,
  READER_KINDS,
  readerInputSchema,
  type AgentDto,
  type GateEventDto,
  type Page as PageOf,
  type ReaderDto,
  type ReaderInput,
  type ReaderKind,
  type RegisterDto,
} from '@erp/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Plus, RadioTower, Siren, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterDates } from '@/components/ui/column-filters'
import { Combobox } from '@/components/ui/combobox'
import { Menu, Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Page, PageActions, SearchInput } from '@/components/ui/page'
import { api } from '@/lib/api'
import { fetchAll, timeCell } from '@/lib/excel'
import { formatDateTime } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'

interface LocationOption {
  id: string
  name: string
}

const useLocations = () =>
  useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })

// ───────────────────────────── Readers ─────────────────────────────

/**
 * RFID readers that stay in one place: the one on a till's counter and the
 * gate at a shop's door. Like a printer, each is reached through the agent
 * on its network.
 */
export function ReadersTab({ agents, active }: { agents: AgentDto[]; active: boolean }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  /** `null` adds a new one. */
  const [form, setForm] = useState<ReaderDto | null | undefined>()

  const readers = useQuery({
    queryKey: ['devices', 'readers'],
    queryFn: ({ signal }) => api.get<ReaderDto[]>('/devices/readers', undefined, signal),
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['devices'] })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/devices/readers/${id}`),
    onSuccess: refresh,
  })

  const add = () => {
    if (agents.length) {
      setForm(null)
    } else {
      toast.error(t('devices.needAgentForReader'))
    }
  }
  useHotkey('n', add, {
    label: t('devices.addReader'),
    group: t('shortcuts.groupList'),
    enabled: active && form === undefined,
  })

  const columns = useMemo<ColumnDef<ReaderDto>[]>(
    () => [
      {
        id: 'name',
        header: t('devices.name'),
        meta: { fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'kind',
        header: t('devices.readerKind'),
        cell: ({ row }) => (
          <Badge tone={row.original.kind === 'gate' ? 'warn' : 'info'}>{READER_KIND_LABELS[row.original.kind]}</Badge>
        ),
      },
      {
        id: 'place',
        header: t('devices.readerPlace'),
        cell: ({ row }) => [row.original.registerName, row.original.locationName].filter(Boolean).join(' · '),
      },
      {
        id: 'address',
        header: t('devices.address'),
        meta: { className: 'font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => `${row.original.host}:${row.original.port}`,
      },
      { id: 'agent', header: t('devices.agent'), cell: ({ row }) => row.original.agentName },
      {
        id: 'state',
        header: t('common.status'),
        cell: ({ row }) =>
          // Three answers: the agent is away and nobody knows; it is there and has the reader; it is there and has not.
          row.original.connected === null ? (
            <Badge>{t('devices.agentAway')}</Badge>
          ) : row.original.connected ? (
            <Badge tone="ok">{t('devices.online')}</Badge>
          ) : (
            <Badge tone="bad">{t('devices.readerSilent')}</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) => (
          <span onClick={(event) => event.stopPropagation()}>
            <Menu
              trigger={
                <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                  <MoreHorizontal />
                </Button>
              }
              items={[
                { label: t('common.edit'), icon: <Pencil />, onSelect: () => setForm(row.original) },
                {
                  label: t('common.delete'),
                  icon: <Trash2 />,
                  tone: 'danger',
                  onSelect: async () => {
                    if (
                      await confirm({
                        title: t('devices.deleteReaderConfirm', { name: row.original.name }),
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
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  return (
    <>
      {active ? (
        <PageActions>
          <Button variant="primary" onClick={add}>
            <Plus />
            {t('devices.addReader')}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        </PageActions>
      ) : null}
      <DataTable
        columns={columns}
        data={readers.data}
        loading={readers.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => setForm(row)}
        empty={<EmptyState icon={RadioTower} title={t('devices.emptyReaders')} hint={t('devices.emptyReadersHint')} />}
      />
      {form !== undefined ? (
        <ReaderFormDialog
          reader={form}
          agents={agents}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            refresh()
            setForm(undefined)
          }}
        />
      ) : null}
    </>
  )
}

interface ReaderValues {
  name: string
  kind: ReaderKind
  agentId: string | null
  registerId: string | null
  locationId: string | null
  host: string
  port: number | null
}

function ReaderFormDialog({
  reader,
  agents,
  onClose,
  onSaved,
}: {
  reader: ReaderDto | null
  agents: AgentDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const locations = useLocations()
  const registers = useQuery({
    queryKey: ['money', 'registers'],
    queryFn: ({ signal }) => api.get<RegisterDto[]>('/money/registers', undefined, signal),
  })
  const only = agents.length === 1 ? agents[0] : null
  const form = useForm<ReaderValues>({
    defaultValues: {
      name: reader?.name ?? '',
      kind: reader?.kind ?? 'desk',
      agentId: reader?.agentId ?? only?.id ?? null,
      registerId: reader?.registerId ?? null,
      locationId: reader?.kind === 'gate' ? reader.locationId : (only?.locationId ?? null),
      host: reader?.host ?? '',
      port: reader?.port ?? DEFAULT_READER_PORT,
    },
  })
  const errors = form.formState.errors
  const kind = form.watch('kind')

  const mutation = useMutation({
    mutationFn: (input: ReaderInput) =>
      reader ? api.put(`/devices/readers/${reader.id}`, input) : api.post('/devices/readers', input),
    onSuccess: () => {
      toast.success(t('common.saved'))
      onSaved()
    },
    onError: (error) => void applyServerErrors(error, form),
  })
  const submit = form.handleSubmit((values) => {
    const input = zodCheck(form, readerInputSchema, {
      ...values,
      port: values.port ?? DEFAULT_READER_PORT,
      // A reader is either on a till or at a door; what was chosen for the other kind is not sent.
      registerId: values.kind === 'desk' ? values.registerId : null,
      locationId: values.kind === 'gate' ? values.locationId : null,
    })
    if (input) {
      mutation.mutate(input)
    }
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={reader ? t('devices.editReader') : t('devices.addReader')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="reader-form" variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="reader-form" onSubmit={() => void submit()}>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label={t('devices.name')} error={errors.name?.message} required>
            {(id) => (
              <Input id={id} autoFocus placeholder="Chainway R3" invalid={!!errors.name} {...form.register('name')} />
            )}
          </Field>
          <Field label={t('devices.readerKind')}>
            {(id) => (
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    options={READER_KINDS.map((value) => ({ value, label: READER_KIND_LABELS[value] }))}
                  />
                )}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('devices.agent')}
            hint={t('devices.readerAgentHint')}
            error={errors.agentId?.message}
            required
          >
            {(id) => (
              <Controller
                control={form.control}
                name="agentId"
                render={({ field }) => (
                  <Combobox
                    id={id}
                    options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.agentId}
                  />
                )}
              />
            )}
          </Field>
          {kind === 'desk' ? (
            <Field label={t('devices.register')} error={errors.registerId?.message} required>
              {(id) => (
                <Controller
                  control={form.control}
                  name="registerId"
                  render={({ field }) => (
                    <Combobox
                      id={id}
                      options={(registers.data ?? [])
                        .filter((register) => register.isActive || register.id === field.value)
                        .map((register) => ({ value: register.id, label: register.name, hint: register.locationName }))}
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.registerId}
                    />
                  )}
                />
              )}
            </Field>
          ) : (
            <Field label={t('devices.shop')} error={errors.locationId?.message} required>
              {(id) => (
                <Controller
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <Combobox
                      id={id}
                      options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.locationId}
                    />
                  )}
                />
              )}
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label={t('devices.host')} hint={t('devices.readerHostHint')} error={errors.host?.message} required>
            {(id) => (
              <Input
                id={id}
                className="font-code"
                placeholder={kind === 'desk' ? '127.0.0.1' : '192.168.99.202'}
                invalid={!!errors.host}
                {...form.register('host')}
              />
            )}
          </Field>
          <Field label={t('devices.port')} error={errors.port?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="port"
                render={({ field }) => (
                  <NumberInput
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    min={1}
                    max={65535}
                    invalid={!!errors.port}
                  />
                )}
              />
            )}
          </Field>
        </div>
      </Form>
    </Dialog>
  )
}

// ───────────────────────────── The gate's log ─────────────────────────────

const route = getRouteApi('/gate')

/** Pieces that went through a gate without having been sold: which, where and when. */
export function GatePage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const locations = useLocations()

  const list = useQuery({
    queryKey: ['gate-events', 'list', search],
    queryFn: ({ signal }) => api.get<PageOf<GateEventDto>>('/gate-events', search, signal),
    placeholderData: keepPreviousData,
  })
  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<GateEventDto>[]>(
    () => [
      {
        id: 'at',
        header: t('gate.at'),
        meta: { export: (row) => timeCell(row.at), fixed: true, className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.at),
      },
      {
        id: 'title',
        header: t('gate.piece'),
        meta: { export: (row) => row.title },
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: 'sku',
        header: t('products.sku'),
        meta: { export: (row) => row.sku, className: 'font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.sku ?? '',
      },
      {
        id: 'epc',
        header: t('gate.tag'),
        meta: { export: (row) => row.epc, className: 'font-code text-xs whitespace-nowrap text-ink-2' },
        cell: ({ row }) => `#${row.original.epc.slice(-6)}`,
      },
      {
        id: 'location',
        header: t('gate.shop'),
        meta: { export: (row) => row.locationName },
        cell: ({ row }) => row.original.locationName ?? '',
      },
      {
        id: 'reader',
        header: t('gate.reader'),
        meta: { export: (row) => row.readerName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.readerName,
      },
    ],
    [t],
  )

  const filtered = !!(search.q || search.locationId || search.from || search.to)

  return (
    <Page title={t('gate.title')}>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        exportAs={{
          fileName: t('gate.title'),
          rows: () => fetchAll<GateEventDto>('/gate-events', search),
        }}
        preferenceKey="gate-events"
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => filter({ size }),
        }}
        filters={{
          at: <FilterDates from={search.from} to={search.to} onChange={(range) => filter(range)} />,
          location: (
            <FilterCombo
              options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
              value={search.locationId ?? null}
              onChange={(locationId) => filter({ locationId: locationId ?? undefined })}
            />
          ),
        }}
        toolbar={<SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />}
        empty={
          <EmptyState
            icon={Siren}
            title={filtered ? t('common.nothingFound') : t('gate.empty')}
            hint={filtered ? undefined : t('gate.emptyHint')}
          />
        }
      />
    </Page>
  )
}
