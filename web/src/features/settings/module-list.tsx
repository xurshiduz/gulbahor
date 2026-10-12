import { MODULES, type ModuleState } from '@erp/core'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/ui/controls'
import { Card } from '@/components/ui/page'

/** The modules a business has on once one is switched: what it needs comes on with it, what needs it goes off. */
export function switched(enabled: Iterable<string>, key: string, on: boolean): string[] {
  const next = new Set(enabled)
  if (on) {
    next.add(key)
    MODULES.find((module) => module.key === key)?.requires?.forEach((required) => next.add(required))
  } else {
    next.delete(key)
    // Whatever needs this module cannot stay on without it.
    MODULES.filter((module) => module.requires?.includes(key)).forEach((dependent) => next.delete(dependent.key))
  }
  return [...next]
}

interface ModuleListProps {
  enabled: ReadonlySet<string>
  onToggle: (key: string, on: boolean) => void
  busy?: boolean
}

/**
 * What the system can do, in three lists that say what a switch is worth: what a business turns on and off
 * (off, it is in neither the menu nor the forms); what every business has, with nothing to switch; and what is
 * not built yet, where a switch only remembers that it is wanted.
 */
export function ModuleList({ enabled, onToggle, busy }: ModuleListProps) {
  const { t } = useTranslation()
  const of = (state: ModuleState) => MODULES.filter((module) => module.state === state)
  const switches = (state: 'optional' | 'planned') =>
    of(state).map((module) => {
      const required = module.requires?.map((key) => MODULES.find((item) => item.key === key)?.title).filter(Boolean)
      return (
        <div key={module.key} className="px-4 py-3" data-module={module.key}>
          <Switch
            checked={enabled.has(module.key)}
            onChange={(on) => onToggle(module.key, on)}
            disabled={busy}
            label={module.title}
            hint={
              <>
                {module.description}
                {required?.length ? (
                  <span className="text-ink-2"> {t('settings.requires', { name: required.join(', ') })}.</span>
                ) : null}
              </>
            }
          />
        </div>
      )
    })

  return (
    <div className="flex flex-col gap-4">
      <ModuleGroup state="optional" title={t('settings.modulesOptional')} note={t('settings.modulesOptionalNote')}>
        {switches('optional')}
      </ModuleGroup>
      <ModuleGroup state="included" title={t('settings.modulesIncluded')} note={t('settings.modulesIncludedNote')}>
        {of('included').map((module) => (
          <div key={module.key} className="flex items-start gap-2.5 px-4 py-3" data-module={module.key}>
            <Check className="mt-0.5 size-4 shrink-0 text-ok" />
            <span className="min-w-0">
              <span className="block text-[13px] text-ink">{module.title}</span>
              <span className="block text-xs text-ink-3">{module.description}</span>
            </span>
          </div>
        ))}
      </ModuleGroup>
      <ModuleGroup state="planned" title={t('settings.modulesPlanned')} note={t('settings.modulesPlannedNote')}>
        {switches('planned')}
      </ModuleGroup>
    </div>
  )
}

function ModuleGroup({
  state,
  title,
  note,
  children,
}: {
  state: ModuleState
  title: string
  note: string
  children: ReactNode
}) {
  return (
    <section data-module-group={state}>
      <h2 className="eyebrow">{title}</h2>
      <p className="mt-0.5 mb-2 text-xs text-ink-3">{note}</p>
      <Card className="divide-y divide-line p-0">{children}</Card>
    </section>
  )
}
