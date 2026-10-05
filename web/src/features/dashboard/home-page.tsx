import { MODULES, type AuditDto, type LocationDto, type Page as PageOf, type UserDto } from '@gulbahor/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Building2, KeyRound, ShieldCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge, Skeleton } from '@/components/ui/feedback'
import { Card, Page } from '@/components/ui/page'
import { useAuditText } from '@/features/audit/audit-text'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { formatRecent } from '@/lib/format'

/** The first screen after sign-in. It will carry the day's numbers once sales and money exist. */
export function HomePage() {
  const { t } = useTranslation()
  const { me, can } = useSession()
  const describe = useAuditText()

  const locations = useQuery({
    queryKey: ['locations', 'count'],
    queryFn: ({ signal }) => api.get<PageOf<LocationDto>>('/locations', { size: 1 }, signal),
    enabled: can('locations.view'),
  })
  const users = useQuery({
    queryKey: ['users', 'count'],
    queryFn: ({ signal }) => api.get<PageOf<UserDto>>('/users', { size: 1, status: 'active' }, signal),
    enabled: can('users.view'),
  })
  const recent = useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: ({ signal }) => api.get<PageOf<AuditDto>>('/audit', { size: 8 }, signal),
    enabled: can('audit.view'),
  })

  const modules = MODULES.filter((module) => me.org.modules.includes(module.key))

  return (
    <Page title={t('home.greeting', { name: me.user.fullName.split(' ')[0] })} flow>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {can('locations.view') ? <Stat to="/locations" icon={Building2} label={t('home.places')} value={locations.data?.total} /> : null}
          {can('users.view') ? <Stat to="/users" icon={Users} label={t('home.people')} value={users.data?.total} /> : null}
          {can('roles.manage') ? <Stat to="/roles" icon={KeyRound} label={t('nav.roles')} value={undefined} hideValue /> : null}
          {!me.user.hasPin ? (
            <Link
              to="/profile"
              search={{ tab: 'security' }}
              className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn-soft p-4 transition-colors hover:border-warn"
            >
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-warn" />
              <span>
                <span className="block text-[13px] font-semibold text-ink">{t('home.setPin')}</span>
                <span className="mt-0.5 block text-xs text-ink-2">{t('home.setPinHint')}</span>
              </span>
            </Link>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={t('home.modules')} className="lg:col-span-1">
            {modules.length ? (
              <div className="flex flex-wrap gap-1.5">
                {modules.map((module) => (
                  <Badge key={module.key} tone="accent">
                    {module.title}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-3">{t('common.empty')}</p>
            )}
          </Card>

          {can('audit.view') ? (
            <Card title={t('home.recent')} className="lg:col-span-2">
              {recent.isPending ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-4 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="flex flex-col">
                  {recent.data?.items.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-3 border-b border-line py-1.5 text-[13px] last:border-0">
                      <span className="tabular w-28 shrink-0 text-xs text-ink-3">{formatRecent(item.at)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{item.actorName ?? t('audit.system')}</span>
                        <span className="text-ink-2"> · {describe.action(item.action)}</span>
                        {item.summary ? <span className="text-ink-3"> · {item.summary}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  )
}

function Stat({
  to,
  icon: Icon,
  label,
  value,
  hideValue,
}: {
  to: string
  icon: typeof Building2
  label: string
  value: number | undefined
  hideValue?: boolean
}) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs text-ink-3">{label}</span>
        {hideValue ? null : value === undefined ? (
          <Skeleton className="mt-1 h-5 w-10" />
        ) : (
          <span className="tabular block text-lg leading-tight font-semibold">{value}</span>
        )}
      </span>
    </Link>
  )
}
