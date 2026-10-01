import {
  ATTRIBUTE_KIND_LABELS,
  GENDER_LABELS,
  LOCATION_KIND_LABELS,
  MODULES,
  PERMISSION_GROUPS,
  PRICE_KIND_LABELS,
  SEASON_LABELS,
  UNIT_INFO,
} from '@gulbahor/core'
import { useTranslation } from 'react-i18next'

const PERMISSION_TITLES = new Map(
  PERMISSION_GROUPS.flatMap((group) => [
    [`${group.key}.*`, group.title] as const,
    ...group.permissions.map((permission) => [permission.key, `${group.title}: ${permission.title}`] as const),
  ]),
)
const MODULE_TITLES = new Map(MODULES.map((module) => [module.key, module.title]))

/** Fields whose stored value is a code: what each code is called. */
const CODE_LABELS: Record<string, Record<string, string>> = {
  kind: { ...LOCATION_KIND_LABELS, ...ATTRIBUTE_KIND_LABELS, ...PRICE_KIND_LABELS },
  gender: GENDER_LABELS,
  season: SEASON_LABELS,
  unit: Object.fromEntries(Object.entries(UNIT_INFO).map(([unit, info]) => [unit, info.label])),
}

/** Turns history's codes and raw values into words a person reads. */
export function useAuditText() {
  const { t } = useTranslation()

  const value = (field: string, raw: unknown): string => {
    if (raw === null || raw === undefined || raw === '') {
      return '—'
    }
    if (typeof raw === 'boolean') {
      return raw ? t('common.yes') : t('common.no')
    }
    if (Array.isArray(raw)) {
      const names = raw.map((item) => {
        if (field === 'permissions') return PERMISSION_TITLES.get(String(item)) ?? String(item)
        if (field === 'modules') return MODULE_TITLES.get(String(item)) ?? String(item)
        return String(item)
      })
      return names.length ? names.join(', ') : '—'
    }
    return CODE_LABELS[field]?.[String(raw)] ?? String(raw)
  }

  // Action codes contain dots ("user.create"), so they are looked up in the object rather than by path.
  const actions = t('audit.actions', { returnObjects: true }) as Record<string, string>

  return {
    action: (code: string) => actions[code] ?? code,
    entity: (code: string | null) => (code ? t(`audit.entities.${code}`, { defaultValue: code }) : ''),
    field: (name: string) => t(`audit.fields.${name}`, { defaultValue: name }),
    value,
  }
}
