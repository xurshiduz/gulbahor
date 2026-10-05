import {
  agentInputSchema,
  DEFAULT_LABEL_SIZE,
  LABEL_SIZE_KEYS,
  PRINTER_DPIS,
  printerInputSchema,
  type AgentDto,
  type AgentInput,
  type AgentKeyDto,
  type LabelSizeKey,
  type PrinterDto,
  type PrinterInput,
  type PrintJobDto,
} from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Copy,
  KeyRound,
  MonitorSmartphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  TestTube,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Checkbox, Menu, Select, TabPanel, Tabs } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Page } from '@/components/ui/page'
import { api } from '@/lib/api'
import { formatRecent } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'

import { ReadersTab } from './readers'

const route = getRouteApi('/devices')

interface LocationOption {
  id: string
  name: string
}

const useLocations = () =>
  useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })

const Online = ({ online }: { online: boolean }) => {
  const { t } = useTranslation()
  return <Badge tone={online ? 'ok' : 'neutral'}>{online ? t('devices.online') : t('devices.offline')}</Badge>
}

/**
 * The shop's equipment. A printer is reached through an agent: the program
 * on a shop computer that is on the same network as the printer and keeps a
 * connection open to the server.
 */
export function DevicesPage() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()

  const agents = useQuery({
    queryKey: ['devices', 'agents'],
    queryFn: ({ signal }) => api.get<AgentDto[]>('/devices/agents', undefined, signal),
  })
  const printers = useQuery({
    queryKey: ['devices', 'printers'],
    queryFn: ({ signal }) => api.get<PrinterDto[]>('/devices/printers', undefined, signal),
  })

  /** `null` adds a new one. */
  const [agentForm, setAgentForm] = useState<AgentDto | null | undefined>()
  const [printerForm, setPrinterForm] = useState<PrinterDto | null | undefined>()
  const [issued, setIssued] = useState<AgentKeyDto | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['devices'] })

  const remove = useMutation({
    mutationFn: (path: string) => api.delete(path),
    onSuccess: refresh,
  })
  const renewKey = useMutation({
    mutationFn: (id: string) => api.post<AgentKeyDto>(`/devices/agents/${id}/key`),
    onSuccess: (agent) => {
      refresh()
      setIssued(agent)
    },
  })
  const test = useMutation({
    mutationFn: (id: string) => api.post<PrintJobDto>(`/devices/printers/${id}/test`),
    onSuccess: (job) => {
      if (job.agentOnline) {
        toast.success(t('devices.testSent'))
      } else {
        toast.warning(t('devices.testQueued'))
      }
    },
  })

  const add = () => {
    if (tab === 'agents') {
      setAgentForm(null)
    } else if (!agents.data?.length) {
      toast.error(t('devices.needAgent'))
      void navigate({ search: { tab: 'agents' } })
    } else {
      setPrinterForm(null)
    }
  }
  const formOpen = agentForm !== undefined || printerForm !== undefined || !!issued
  useHotkey('n', add, {
    label: tab === 'agents' ? t('devices.addAgent') : t('devices.addPrinter'),
    group: t('shortcuts.groupList'),
    // The readers' tab has its own button and its own key.
    enabled: !formOpen && tab !== 'readers',
  })

  const printerColumns = useMemo<ColumnDef<PrinterDto>[]>(
    () => [
      {
        id: 'name',
        header: t('devices.name'),
        meta: { fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { id: 'location', header: t('receipts.location'), cell: ({ row }) => row.original.locationName ?? '' },
      {
        id: 'address',
        header: t('devices.address'),
        meta: { className: 'font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => `${row.original.host}:${row.original.port}`,
      },
      {
        id: 'format',
        header: t('devices.labelSize'),
        meta: { className: 'tabular whitespace-nowrap' },
        cell: ({ row }) => `${row.original.labelSize.replace('x', ' × ')} mm · ${row.original.dpi} dpi`,
      },
      {
        id: 'rfid',
        header: 'RFID',
        cell: ({ row }) =>
          row.original.rfid ? <Badge tone="accent">RFID</Badge> : <span className="text-ink-3">—</span>,
      },
      {
        id: 'agent',
        header: t('devices.agent'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            {row.original.agentName}
            <Online online={row.original.online} />
          </span>
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
                { label: t('devices.test'), icon: <TestTube />, onSelect: () => test.mutate(row.original.id) },
                { label: t('common.edit'), icon: <Pencil />, onSelect: () => setPrinterForm(row.original) },
                {
                  label: t('common.delete'),
                  icon: <Trash2 />,
                  tone: 'danger',
                  onSelect: async () => {
                    if (
                      await confirm({
                        title: t('devices.deletePrinterConfirm', { name: row.original.name }),
                        confirmLabel: t('common.delete'),
                        tone: 'danger',
                      })
                    ) {
                      remove.mutate(`/devices/printers/${row.original.id}`)
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

  const agentColumns = useMemo<ColumnDef<AgentDto>[]>(
    () => [
      {
        id: 'name',
        header: t('devices.name'),
        meta: { fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { id: 'location', header: t('receipts.location'), cell: ({ row }) => row.original.locationName ?? '' },
      { id: 'status', header: t('common.status'), cell: ({ row }) => <Online online={row.original.online} /> },
      {
        id: 'seen',
        header: t('devices.lastSeen'),
        meta: { className: 'text-ink-2 whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.online
            ? t('devices.now')
            : row.original.lastSeenAt
              ? formatRecent(row.original.lastSeenAt)
              : t('devices.neverSeen'),
      },
      {
        id: 'computer',
        header: t('devices.computer'),
        meta: { className: 'text-ink-2' },
        cell: ({ row }) => [row.original.hostname, row.original.version].filter(Boolean).join(' · '),
      },
      {
        id: 'printers',
        header: t('devices.printers'),
        meta: { className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => row.original.printers,
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
                { label: t('common.edit'), icon: <Pencil />, onSelect: () => setAgentForm(row.original) },
                {
                  label: t('devices.renewKey'),
                  icon: <KeyRound />,
                  onSelect: async () => {
                    if (
                      await confirm({
                        title: t('devices.renewConfirm', { name: row.original.name }),
                        confirmLabel: t('devices.renewKey'),
                        tone: 'danger',
                      })
                    ) {
                      renewKey.mutate(row.original.id)
                    }
                  },
                },
                {
                  label: t('common.delete'),
                  icon: <Trash2 />,
                  tone: 'danger',
                  onSelect: async () => {
                    if (
                      await confirm({
                        title: t('devices.deleteAgentConfirm', { name: row.original.name }),
                        confirmLabel: t('common.delete'),
                        tone: 'danger',
                      })
                    ) {
                      remove.mutate(`/devices/agents/${row.original.id}`)
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
    <Page
      title={t('devices.title')}
      actions={
        tab === 'readers' ? null : (
          <Button variant="primary" onClick={add}>
            <Plus />
            {tab === 'agents' ? t('devices.addAgent') : t('devices.addPrinter')}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        )
      }
    >
      <Tabs
        value={tab}
        onChange={(value) => void navigate({ search: { tab: value as typeof tab } })}
        tabs={[
          { value: 'printers', label: t('devices.printers') },
          { value: 'readers', label: t('devices.readers') },
          { value: 'agents', label: t('devices.agents') },
        ]}
      >
        <TabPanel value="printers">
          <DataTable
            columns={printerColumns}
            data={printers.data}
            loading={printers.isFetching}
            rowId={(row) => row.id}
            onRowOpen={(row) => setPrinterForm(row)}
            empty={
              <EmptyState icon={Printer} title={t('devices.emptyPrinters')} hint={t('devices.emptyPrintersHint')} />
            }
          />
        </TabPanel>
        <TabPanel value="readers">
          <ReadersTab agents={agents.data ?? []} active={tab === 'readers'} />
        </TabPanel>
        <TabPanel value="agents">
          <DataTable
            columns={agentColumns}
            data={agents.data}
            loading={agents.isFetching}
            rowId={(row) => row.id}
            onRowOpen={(row) => setAgentForm(row)}
            empty={
              <EmptyState
                icon={MonitorSmartphone}
                title={t('devices.emptyAgents')}
                hint={t('devices.emptyAgentsHint')}
              />
            }
          />
        </TabPanel>
      </Tabs>

      {agentForm !== undefined ? (
        <AgentFormDialog
          agent={agentForm}
          onClose={() => setAgentForm(undefined)}
          onSaved={(saved) => {
            refresh()
            setAgentForm(undefined)
            if ('key' in saved) {
              setIssued(saved as AgentKeyDto)
            }
          }}
        />
      ) : null}
      {printerForm !== undefined ? (
        <PrinterFormDialog
          printer={printerForm}
          agents={agents.data ?? []}
          onClose={() => setPrinterForm(undefined)}
          onSaved={() => {
            refresh()
            setPrinterForm(undefined)
          }}
        />
      ) : null}
      {issued ? <KeyDialog agent={issued} onClose={() => setIssued(null)} /> : null}
    </Page>
  )
}

// ───────────────────────────── Agent ─────────────────────────────

interface AgentValues {
  name: string
  locationId: string | null
}

function AgentFormDialog({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentDto | null
  onClose: () => void
  onSaved: (agent: AgentDto | AgentKeyDto) => void
}) {
  const { t } = useTranslation()
  const locations = useLocations()
  const form = useForm<AgentValues>({
    defaultValues: { name: agent?.name ?? '', locationId: agent?.locationId ?? null },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: AgentInput) =>
      agent ? api.put<AgentDto>(`/devices/agents/${agent.id}`, input) : api.post<AgentKeyDto>('/devices/agents', input),
    onSuccess: (saved) => {
      if (agent) {
        toast.success(t('common.saved'))
      }
      onSaved(saved)
    },
    onError: (error) => void applyServerErrors(error, form),
  })
  const submit = zodSubmit(form, agentInputSchema, (input) => mutation.mutate(input))

  return (
    <Dialog
      open
      onClose={onClose}
      title={agent ? t('devices.editAgent') : t('devices.addAgent')}
      description={agent ? undefined : t('devices.agentHint')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="agent-form" variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="agent-form" onSubmit={() => void submit()}>
        <Field label={t('devices.name')} hint={t('devices.agentNameHint')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label={t('receipts.location')} error={errors.locationId?.message}>
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
      </Form>
    </Dialog>
  )
}

/** The key is shown this once; what to do with it is shown beside it. */
function KeyDialog({ agent, onClose }: { agent: AgentKeyDto; onClose: () => void }) {
  const { t } = useTranslation()
  const config = JSON.stringify({ url: window.location.origin, key: agent.key }, null, 2)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config)
      toast.success(t('devices.copied'))
    } catch {
      toast.error(t('devices.copyFailed'))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('devices.keyTitle', { name: agent.name })}
      description={t('devices.keyHint')}
      size="lg"
      footer={
        <>
          <Button onClick={() => void copy()}>
            <Copy />
            {t('devices.copy')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('devices.keyDone')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] text-ink-2">
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t('devices.step1')}</li>
          <li>{t('devices.step2')}</li>
          <li>{t('devices.step3')}</li>
        </ol>
        <pre className="font-code overflow-x-auto rounded-md border border-line bg-sunken p-3 text-xs text-ink select-all">
          {config}
        </pre>
        <p className="text-xs text-warn">{t('devices.keyOnce')}</p>
      </div>
    </Dialog>
  )
}

// ───────────────────────────── Printer ─────────────────────────────

interface PrinterValues {
  name: string
  agentId: string | null
  locationId: string | null
  host: string
  port: number | null
  dpi: string
  labelSize: LabelSizeKey
  rfid: boolean
}

function PrinterFormDialog({
  printer,
  agents,
  onClose,
  onSaved,
}: {
  printer: PrinterDto | null
  agents: AgentDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const locations = useLocations()
  const form = useForm<PrinterValues>({
    defaultValues: {
      name: printer?.name ?? '',
      agentId: printer?.agentId ?? (agents.length === 1 ? agents[0].id : null),
      locationId: printer?.locationId ?? (agents.length === 1 ? agents[0].locationId : null),
      host: printer?.host ?? '',
      port: printer?.port ?? 9100,
      dpi: String(printer?.dpi ?? 203),
      labelSize: printer?.labelSize ?? DEFAULT_LABEL_SIZE,
      rfid: printer?.rfid ?? true,
    },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: PrinterInput) =>
      printer ? api.put(`/devices/printers/${printer.id}`, input) : api.post('/devices/printers', input),
    onSuccess: () => {
      toast.success(t('common.saved'))
      onSaved()
    },
    onError: (error) => void applyServerErrors(error, form),
  })
  const submit = form.handleSubmit((values) => {
    const input = zodCheck(form, printerInputSchema, { ...values, dpi: Number(values.dpi), port: values.port ?? 9100 })
    if (input) {
      mutation.mutate(input)
    }
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={printer ? t('devices.editPrinter') : t('devices.addPrinter')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="printer-form" variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="printer-form" onSubmit={() => void submit()}>
        <Field label={t('devices.name')} error={errors.name?.message} required>
          {(id) => (
            <Input id={id} autoFocus placeholder="Chainway CP30" invalid={!!errors.name} {...form.register('name')} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('devices.agent')} hint={t('devices.agentFieldHint')} error={errors.agentId?.message} required>
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
          <Field label={t('receipts.location')} error={errors.locationId?.message}>
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
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label={t('devices.host')} hint={t('devices.hostHint')} error={errors.host?.message} required>
            {(id) => (
              <Input
                id={id}
                className="font-code"
                placeholder="192.168.1.50"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('devices.labelSize')}>
            {(id) => (
              <Controller
                control={form.control}
                name="labelSize"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    options={LABEL_SIZE_KEYS.map((key) => ({ value: key, label: `${key.replace('x', ' × ')} mm` }))}
                  />
                )}
              />
            )}
          </Field>
          <Field label={t('labels.dpi')}>
            {(id) => (
              <Controller
                control={form.control}
                name="dpi"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    options={PRINTER_DPIS.map((dpi) => ({ value: String(dpi), label: `${dpi} dpi` }))}
                  />
                )}
              />
            )}
          </Field>
        </div>
        <Controller
          control={form.control}
          name="rfid"
          render={({ field }) => (
            <Checkbox
              checked={field.value}
              onChange={field.onChange}
              label={t('devices.rfid')}
              hint={t('devices.rfidHint')}
            />
          )}
        />
      </Form>
    </Dialog>
  )
}
