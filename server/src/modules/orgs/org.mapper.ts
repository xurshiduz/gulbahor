import { DEFAULT_ORG_SETTINGS, type OrgDto } from '@erp/core'

import type { Organization } from '../../database/entities'

export function toOrgDto(org: Organization): OrgDto {
  return {
    id: org.id,
    name: org.name,
    timezone: org.timezone,
    baseCurrency: org.baseCurrency,
    modules: org.modules,
    settings: { ...DEFAULT_ORG_SETTINGS, ...org.settings },
    setupCompleted: org.setupCompleted,
  }
}
